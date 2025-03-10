/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  AdminGetUserCommand,
  ChangePasswordCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  GetUserCommand,
  InitiateAuthCommand,
  ListUsersCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  UpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { fromEnv } from '@aws-sdk/credential-provider-env';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UpdateUserProfileDto } from 'src/auth/dto/update-auth.dto';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import jwkToPem from 'jwk-to-pem';

@Injectable()
export class CognitoService {
  private readonly cognitoClient: CognitoIdentityProviderClient;
  private readonly supabase: SupabaseClient;
  private cognitoJwks: string[];

  constructor(
    private readonly configService: ConfigService,
    @Inject('COGNITO_CONFIG')
    private readonly config: {
      userPoolId: string;
      clientId: string;
      clientSecret: string;
      awsRegion: string;
    },
    @Inject('SUPABASE_CONFIG')
    private readonly supabaseConfig: {
      url: string;
      key: string;
    },
  ) {
    this.validateConfig();
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: config.awsRegion,
      credentials: fromEnv(),
    });
    this.supabase = createClient(supabaseConfig.url, supabaseConfig.key);
  }

  private validateConfig(): void {
    if (!this.config.clientId || !this.config.userPoolId || !this.config.awsRegion || !this.config.clientSecret) {
      throw new Error('Missing required Cognito configuration.');
    }

    if (!this.supabaseConfig.url || !this.supabaseConfig.key) {
      throw new Error('Missing Supabase configuration.');
    }
  }

  private computeSecretHash(username: string): string {
    const hmac = crypto.createHmac('sha256', this.config.clientSecret);
    hmac.update(username + this.config.clientId);
    return hmac.digest('base64');
  }

  async registerUser(userDetails: {
    email: string;
    password: string;
    firstname: string;
    lastname: string;
    zipcode: string;
    phonenumber: string;
    address?: string;
    state?: string;
    county?: string;
  }): Promise<any> {
    const { email, password, firstname, lastname, zipcode, phonenumber, address, state, county } = userDetails;
    const username = email;
    const secretHash = this.computeSecretHash(username);
    const fullname = `${firstname} ${lastname}`.trim();
    const formattedPhoneNumber = phonenumber.startsWith('+') ? phonenumber : `+${phonenumber}`;

    try {
      this.validateRequiredFields({ username, password, firstname, lastname, zipcode, phonenumber: formattedPhoneNumber });

      const userAttributes = [
        { Name: 'email', Value: email },
        { Name: 'phone_number', Value: formattedPhoneNumber },
        { Name: 'name', Value: fullname },
        { Name: 'address', Value: address || 'N/A' },
        { Name: 'custom:zipcode', Value: zipcode },
      ];

      const signUpCommand = new SignUpCommand({
        ClientId: this.config.clientId,
        Username: username,
        Password: password,
        SecretHash: secretHash,
        UserAttributes: userAttributes,
      });

      const response = await this.cognitoClient.send(signUpCommand);
      const userId = response?.UserSub;

      if (!userId) {
        throw new InternalServerErrorException('Failed to retrieve user ID.');
      }

      await this.saveUserToSupabase({
        cognito_id: userId,
        firstname,
        lastname,
        email,
        address,
        state,
        county,
        zipcode,
        phonenumber: formattedPhoneNumber,
      });

      return {
        success: true,
        userId,
        message: 'User registered successfully. Please check your email or phone to confirm your account.',
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw new InternalServerErrorException(`Registration failed: ${error.message}`);
    }
  }

  private validateRequiredFields(fields: { [key: string]: string }): void {
    for (const [key, value] of Object.entries(fields)) {
      if (!value) {
        throw new BadRequestException(`Missing required field: ${key}`);
      }
    }
  } 

  private async saveUserToSupabase(userDetails: {
    cognito_id: string;
    firstname: string;
    lastname: string;
    email: string;
    address?: string;
    state?: string;
    county?: string;
    zipcode?: string;
    phonenumber: string;
  }): Promise<void> {
    const { error } = await this.supabase.from('users').insert(userDetails);
    if (error) {
      console.error('Supabase error:', error);
      throw new InternalServerErrorException(`Database error: ${error.message}`);
    }
  }

  async loginUser(username: string, password?: string, refreshToken?: string): Promise<any> {
    try {
      if (refreshToken) {
        return await this.handleRefreshTokenLogin(username, refreshToken);
      }

      if (!password) {
        throw new UnauthorizedException('Password is required.');
      }

      return await this.handlePasswordLogin(username, password);
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Login failed.');
    }
  }

  private async handlePasswordLogin(username: string, password: string): Promise<any> {
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.config.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: this.computeSecretHash(username),
      },
    });

    const response = await this.cognitoClient.send(authCommand);
    if (!response.AuthenticationResult) {
      throw new UnauthorizedException('Authentication failed.');
    }

    const { IdToken, AccessToken, RefreshToken } = response.AuthenticationResult;
    const decodedToken = jwt.decode(IdToken) as any;

    const cognitoId = decodedToken?.sub;
    if (!cognitoId) {
      throw new InternalServerErrorException('Failed to retrieve Cognito ID.');
    }

    const userInfo = await this.getUserInfo(IdToken);
    if (!userInfo) {
      throw new NotFoundException('User not found.');
    }

    return {
      idToken: IdToken,
      accessToken: AccessToken,
      refreshToken: RefreshToken,
      user: userInfo,
    };
  }

  async handleRefreshTokenLogin(username: string, refreshToken: string): Promise<any> {
    const refreshCommand = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: this.config.clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
        SECRET_HASH: this.computeSecretHash(username),
      },
    });

    const refreshResponse = await this.cognitoClient.send(refreshCommand);
    if (!refreshResponse.AuthenticationResult?.IdToken) {
      throw new UnauthorizedException('Failed to refresh the token.');
    }

    const userInfo = await this.getUserInfo(refreshResponse.AuthenticationResult.IdToken);
    if (!userInfo) throw new UnauthorizedException('User verification failed.');

    return {
      idToken: refreshResponse.AuthenticationResult.IdToken,
      accessToken: refreshResponse.AuthenticationResult.AccessToken,
      refreshToken,
      user: userInfo,
    };
  }

  async getUserInfo(idToken: string): Promise<any> {
    try {
      // Decode and validate the token
      const decodedToken = jwt.decode(idToken) as any;
      if (!decodedToken) {
        throw new UnauthorizedException('Invalid ID Token.');
      }

      const email = decodedToken?.email;
      if (!email) {
        throw new UnauthorizedException('Email not found in the token.');
      }

      if (!this.supabase) {
        throw new InternalServerErrorException('Supabase client is not initialized.');
      }

      // Fetch user details from Supabase
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error) {
        console.error('Supabase query error:', error);
        throw new InternalServerErrorException(`Error fetching user details: ${error.message}`);
      }

      if (!data) {
        throw new UnauthorizedException('User not found.');
      }

      return data;
    } catch (error) {
      console.error('Error getting user info:', error);
      throw new InternalServerErrorException(`Failed to get user info: ${error.message}`);
    }
  }
  
  async updateUser(accessToken: string, updatedUserAttributes: UpdateUserProfileDto): Promise<any> {
    const userAttributes = Object.entries(updatedUserAttributes)
      .filter(([_, value]) => value !== undefined)
      .map(([Name, Value]) => ({ Name, Value }));
 
    try {
      const command = new UpdateUserAttributesCommand({
        AccessToken: accessToken,
        UserAttributes: userAttributes,
      });
      return await this.cognitoClient.send(command);
    } catch (error) {
      throw new InternalServerErrorException('Failed to update profile.');
    }
  }

  async confirmSignUp(username: string, confirmationCode: string): Promise<any> {
    const command = new ConfirmSignUpCommand({
      ClientId: this.config.clientId,
      Username: username,
      ConfirmationCode: confirmationCode,
      SecretHash: this.computeSecretHash(username),
    });

    try {
      await this.cognitoClient.send(command);
      return { success: true, message: 'User confirmed successfully.' };
    } catch (error) {
      console.error('User confirmation error:', error);
      throw new InternalServerErrorException(`User confirmation failed: ${error.message}`);
    }
  }

  async resendConfirmationCode(email: string): Promise<any> {
    try {
      const command = new ResendConfirmationCodeCommand({
        ClientId: this.config.clientId,
        Username: email,
        SecretHash: this.computeSecretHash(email),
      });
      return await this.cognitoClient.send(command);
    } catch (error) {
      throw this.handleConfirmationError(error);
    }
  }

  private handleConfirmationError(error: any): Error {
    switch (error.__type) {
      case 'CodeMismatchException':
        throw new BadRequestException('Invalid confirmation code.');
      case 'ExpiredCodeException':
        throw new BadRequestException('Confirmation code expired.');
      default:
        throw new InternalServerErrorException('Failed to verify email.');
    }
  }

  async getTotalUsers(): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
  
      if (error) {
        console.error('Error fetching total users:', error);
        throw new InternalServerErrorException('Failed to fetch total users.');
      }
  
      return count || 0;
    } catch (error) {
      console.error('Error in getTotalUsers:', error);
      throw new InternalServerErrorException('Failed to fetch total users.');
    }
  }
  
  async getAllUserInfo(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, email, firstname, lastname, created_at');
  
      if (error) {
        console.error('Error fetching users from Supabase:', error);
        throw new InternalServerErrorException('Failed to fetch users.');
      }
  
      return data || [];
    } catch (error) {
      console.error('Error in getAllUserInfo:', error);
      throw new InternalServerErrorException('Failed to fetch users.');
    }
  }
  

  async updateUserProfile(identifier: string, updateUserDto: UpdateUserProfileDto) {
    try {
      if (!identifier) {
        throw new BadRequestException('Invalid identifier.');
      }

      const updateFields: Record<string, any> = {};
      if (updateUserDto.firstname) updateFields.firstname = updateUserDto.firstname;
      if (updateUserDto.lastname) updateFields.lastname = updateUserDto.lastname;
      if (updateUserDto.phonenumber) updateFields.phonenumber = updateUserDto.phonenumber;
      if (updateUserDto.zipcode) updateFields.zipcode = updateUserDto.zipcode;
      if (updateUserDto.email) updateFields.email = updateUserDto.email;

      if (Object.keys(updateFields).length === 0) {
        throw new BadRequestException('No valid attributes provided.');
      }

      const { data, error } = await this.supabase
        .from('users')
        .update(updateFields)
        .eq('email', identifier)
        .select();

      if (error) {
        throw new InternalServerErrorException('Failed to update user.');
      }

      return {
        message: 'User profile updated successfully',
        supabaseData: data,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to update user profile.');
    }
  }

  async changeUserPassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string
  ): Promise<any> {
    try {
      const command = new ChangePasswordCommand({ 
        AccessToken: accessToken,
        PreviousPassword: currentPassword,
        ProposedPassword: newPassword,
      });

      await this.cognitoClient.send(command);
      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      throw new InternalServerErrorException(error.message || 'Failed to change password');
    }
  }

  async refreshToken(refreshToken: string): Promise<any> {
    try {
      const clientId = this.configService.get<string>('COGNITO_CLIENT_ID');
      const secretHash = this.computeSecretHash(refreshToken);

      const command = new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
          SECRET_HASH: secretHash,
        },
      });

      const response = await this.cognitoClient.send(command);

      if (!response.AuthenticationResult) {
        throw new UnauthorizedException('Failed to refresh token');
      }

      return {
        accessToken: response.AuthenticationResult.AccessToken,
        idToken: response.AuthenticationResult.IdToken,
        refreshToken: refreshToken, // Keep the same refresh token
      };
    } catch (error) {
      console.error('Refresh token error:', error);
      throw new InternalServerErrorException('Token refresh failed');
    }
  }

  async getPublicKey(): Promise<string[]> {
    if (this.cognitoJwks) {
      return this.cognitoJwks;
    }
  
    try {
      const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
      const url = `https://cognito-idp.${this.configService.get<string>('REGION')}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  
      const response = await axios.get(url);
      this.cognitoJwks = response.data.keys.map((key: any) => jwkToPem(key)); // Convert JWK to PEM format
  
      return this.cognitoJwks;
    } catch (error) {
      console.error('Error fetching Cognito public key:', error);
      throw new InternalServerErrorException('Failed to get public key');
    }
  }
}