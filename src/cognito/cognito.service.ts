/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, InternalServerErrorException, Inject, BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  UpdateUserAttributesCommand
} from '@aws-sdk/client-cognito-identity-provider';
import * as jwt from 'jsonwebtoken'; 
import * as crypto from 'crypto';
import { fromEnv } from '@aws-sdk/credential-provider-env';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UpdateUserProfileDto } from 'src/auth/dto/update-auth.dto';

@Injectable()
export class CognitoService {
  private readonly cognitoClient: CognitoIdentityProviderClient;
  private readonly supabase: SupabaseClient;
  supabaseClient: any;
  cognito: any;
  jwtService: any;

  constructor(
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
    }
  ) {
    if (!config.clientId || !config.userPoolId || !config.awsRegion || !config.clientSecret) {
      throw new Error(`Missing required environment variables.`);
    }
  
    if (!supabaseConfig.url || !supabaseConfig.key) {
      throw new Error(`Missing Supabase configuration.`);
    }
  
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: config.awsRegion,
      credentials: fromEnv(),
    });
  
    this.supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.key);
  
    console.log('✅ Supabase initialized:', this.supabase ? 'Success' : 'Failed');
  }
  

  private computeSecretHash(username: string): string {
    return crypto.createHmac('sha256', this.config.clientSecret)
      .update(username + this.config.clientId)
      .digest('base64');
  }

  async registerUser(userDetails: {
    email: string;
    password: string;
    fullname: string;
    address: string;
    state: string;
    county: string;
    zipcode: string;
    phonenumber: string;
  }): Promise<any> {
    if (!this.supabase) {
      throw new InternalServerErrorException('Supabase client is not initialized.');
    }
  
    const username = userDetails.email;
    const secretHash = this.computeSecretHash(username);
  
    try {
      // Sign up user in Cognito
      const signUpCommand = new SignUpCommand({
        ClientId: this.config.clientId,
        Username: username,
        Password: userDetails.password,
        SecretHash: secretHash,
        UserAttributes: [
          { Name: 'email', Value: userDetails.email },
          { Name: 'phone_number', Value: userDetails.phonenumber },
          { Name: 'name', Value: userDetails.fullname },
          { Name: 'address', Value: userDetails.address },
          { Name: 'custom:zipcode', Value: userDetails.zipcode },
          { Name: 'custom:county', Value: userDetails.county },
          { Name: 'custom:state', Value: userDetails.state },
        ],
      });
  
      const response = await this.cognitoClient.send(signUpCommand);
      const userId = response?.UserSub;
  
      if (!userId) {
        throw new Error('Failed to retrieve user ID from Cognito.');
      }
  
      console.log('✅ User created in Cognito:', userId);
  
      // Insert user into Supabase
      const { error } = await this.supabase
        .from('users')
        .insert({
          cognito_id: userId,
          firstname: userDetails.fullname.split(' ')[0],
          lastname: userDetails.fullname.split(' ').slice(1).join(' '),
          email: userDetails.email,
          address: userDetails.address,
          state: userDetails.state,
          county: userDetails.county,
          zipcode: userDetails.zipcode,
          phonenumber: userDetails.phonenumber,
        });
  
      if (error) {
        console.error('❌ Supabase Insert Error:', error);
        throw new InternalServerErrorException('Failed to save user in database.');
      }
  
      console.log('✅ User inserted into Supabase:', userDetails.email);
      return { success: true, userId };
    } catch (error) {
      console.error('❌ Registration Error:', error);
      throw new InternalServerErrorException(error.message || 'Registration failed.');
    }
  }

async loginUser(username: string, password: string): Promise<any> {
  try {
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
      throw new UnauthorizedException('Authentication failed');
    }

    const { IdToken } = response.AuthenticationResult;

    // Decode ID Token using jsonwebtoken instead of jwtService
    const decodedToken = jwt.decode(IdToken) as any;
    const cognitoId = decodedToken?.sub;

    if (!cognitoId) {
      throw new InternalServerErrorException('Failed to retrieve Cognito ID.');
    }

    // Fetch user info from Supabase
    const userInfo = await this.getUserInfo(cognitoId);

    return {
      idToken: IdToken, // Only returning idToken
      user: userInfo, // Returning user data
    };
  } catch (error) {
    console.error('❌ Login Error:', error);
    throw this.handleCognitoError(error);
  }
}

async getUserInfo(cognitoId: string) {
  try {
    const { data, error } = await this.supabase
      .from('users')
      .select('cognito_id, email, firstname, lastname, zipcode, phonenumber') // Ensure column names match Supabase
      .eq('cognito_id', cognitoId)
      .single();

    if (error) {
      console.error('❌ Supabase Query Error:', error);
      throw new InternalServerErrorException('Error querying user.');
    }

    return data;
  } catch (error) {
    console.error('❌ Error fetching user from Supabase:', error);
    throw new InternalServerErrorException('Failed to fetch user.');
  }
}


  private handleCognitoError(error: any): Error {
    console.error('Cognito Error Details:', error);
    switch (error.name) {
      case 'UsernameExistsException':
        return new ConflictException('User already exists.');
      case 'InvalidPasswordException':
        return new BadRequestException('Password does not meet the required policy.');
      case 'NotAuthorizedException':
        return new UnauthorizedException('Incorrect credentials.');
      case 'UserNotFoundException':
        return new NotFoundException('User not found.');
      case 'CodeMismatchException':
        return new BadRequestException('Invalid confirmation code.');
      case 'ExpiredCodeException':
        return new BadRequestException('Confirmation code expired.');
      default:
        return new InternalServerErrorException('Operation failed.');
    }
  }

  // Refresh Access Token
  async refreshToken(refreshToken: string): Promise<any> {
    try { 
      const command = new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: this.config.clientId,
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      });
      return await this.cognitoClient.send(command);
    } catch (error) {
      throw new InternalServerErrorException('Could not refresh token.');
    }
  }

  // Update user attributes
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
      throw new InternalServerErrorException('Could not update profile.');
    }
  }

  // Confirm User Registration
  async confirmSignUp(email: string, confirmationCode: string): Promise<any> {
    try {
      const command = new ConfirmSignUpCommand({
        ClientId: this.config.clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
        SecretHash: this.computeSecretHash(email),
      });
      return await this.cognitoClient.send(command);
    } catch (error) {
      throw this.handleConfirmationError(error);
    }
  }

  // Resend confirmation code for registration
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

  // Handle Login Error
  private handleLoginError(error: any): Error {
    switch (error.__type) {
      case 'NotAuthorizedException':
        throw new UnauthorizedException('Incorrect credentials.');
      case 'UserNotFoundException':
        throw new NotFoundException('User not found.');
      default:
        throw new InternalServerErrorException('Login failed.');
    }
  }

  // Handle Confirmation Errors
  private handleConfirmationError(error: any): Error {
    switch (error.__type) {
      case 'CodeMismatchException':
        throw new BadRequestException('Invalid confirmation code.');
      case 'ExpiredCodeException':
        throw new BadRequestException('Confirmation code expired.');
      default:
        throw new InternalServerErrorException('Could not verify email.');
    }
  }

  // Method to get the total number of users
  async getTotalUsers() {
    try {
      const params = {
        UserPoolId: process.env.COGNITO_USER_POOL_ID, // Ensure your user pool ID is set in the environment variables
      };

      const result = await this.cognito.listUsers(params).promise();
      return result.Users.length;
    } catch (error) {
      throw new InternalServerErrorException('Could not retrieve user count');
    }
  }

  async updateUserProfile(email: string, updateUserDto: UpdateUserProfileDto) {
    try {
      const updateCommand = new AdminUpdateUserAttributesCommand({
        UserPoolId: this.config.userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'given_name', Value: updateUserDto.firstName },
          { Name: 'family_name', Value: updateUserDto.lastName },
          { Name: 'phone_number', Value: updateUserDto.phoneNumber },
          { Name: 'custom:zipCode', Value: updateUserDto.zipCode }, // Custom attribute
        ],
      });
  
      await this.cognitoClient.send(updateCommand);
      return { message: 'User profile updated successfully' };
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw new InternalServerErrorException('Failed to update user profile');
    }
}}