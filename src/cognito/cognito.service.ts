/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, InternalServerErrorException, Inject, BadRequestException, ConflictException, NotFoundException, UnauthorizedException, Query } from '@nestjs/common';
import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ListUsersCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  UpdateUserAttributesCommand
} from '@aws-sdk/client-cognito-identity-provider';
import * as jwt from 'jsonwebtoken'; 
import * as crypto from 'crypto';
import { fromEnv } from '@aws-sdk/credential-provider-env';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UpdateUserProfileDto } from 'src/auth/dto/update-auth.dto';
import { ConfigService } from "@nestjs/config";
import { Response } from 'express';

@Injectable()
export class CognitoService {
  private readonly cognitoClient: CognitoIdentityProviderClient;
  private readonly supabase: SupabaseClient;
  supabaseClient: any;
  cognito: any;
  jwtService: any;
  cognitoIdentityServiceProvider: any;
  supabaseService: any;

  constructor(private readonly configService: ConfigService,
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
      region:this.configService.get("REGION"),
      credentials: fromEnv(),
    });
  
    this.supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.key);
  
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
        throw new InternalServerErrorException('Failed to save user in database.');
      }
  

      return { success: true, userId };
    } catch (error) {
      throw new InternalServerErrorException(error.message || 'Registration failed.');
    }
  }
  
  async loginUser(username: string, password: string): Promise<any> {
    try {
      // Initialize Cognito client (if not already done in constructor)
      const cognitoClient = new CognitoIdentityProviderClient({
        region: this.config.awsRegion // Ensure the correct AWS region is used
      });
  
      // Prepare the authentication command
      const authCommand = new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.config.clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
          SECRET_HASH: this.computeSecretHash(username), // Ensure this is implemented correctly
        },
      });
  
      // Send the authentication command
      const response = await cognitoClient.send(authCommand);
  
      // Handle unsuccessful authentication
      if (!response.AuthenticationResult) {
        throw new UnauthorizedException('Authentication failed');
      }
  
      // Extract IdToken from the response
      const { IdToken } = response.AuthenticationResult;
  
      // Decode ID Token to get user information
      const decodedToken = jwt.decode(IdToken) as any;
      const cognitoId = decodedToken?.sub; // Extract the Cognito user ID (sub)
  
      if (!cognitoId) {
        throw new InternalServerErrorException('Failed to retrieve Cognito ID.');
      }
  
      // Fetch user info from your Supabase service (ensure getUserInfo is defined and works)
      const userInfo = await this.getUserInfo(cognitoId);
  
      return {
        idToken: IdToken, // Return the ID token
        user: userInfo,   // Return the user data from Supabase
      };
    } catch (error) {;
      // If it's an AWS SDK error, handle it accordingly
      if (error instanceof Error) {
        return this.handleCognitoError(error);
      }
  
      // If it’s another type of error, throw a generic internal server error
      throw new InternalServerErrorException('An error occurred during login.');
    }
  }
  
  // Example of error handling
  handleCognitoError(error: Error): InternalServerErrorException {
    // Customize the error handling logic based on the error type
  
    // You can inspect the error message and throw specific exceptions based on the message
    if (error.message.includes('not authorized')) {
      return new UnauthorizedException('Invalid credentials.');
    }
  
    return new InternalServerErrorException('An unexpected error occurred during authentication.');
  }

  // Compute Secret Hash for Cognito User Pool client
  computeSecretHash(username: string): string {
    const clientId = this.config.clientId;
    const clientSecret = this.config.clientSecret;
    const hmac = crypto.createHmac('sha256', clientSecret);
    hmac.update(username + clientId);
    return hmac.digest('base64');
  }

  async getUserInfo(@Query("email") email?: string, @Query("id") id?: string) {
    try {
      // 🔹 Validate that either email or id is provided
      if (!email && !id) {
        throw new BadRequestException('Either email or user ID must be provided.');
      }
  
      // 🔹 Log the request details
  
      // 🔹 Initialize Supabase client
      const supabase = this.supabaseService.getClient();
  
      // 🔹 Build query based on email or id
      let query = supabase.from("users").select("cognito_id, email, firstname, lastname, zipcode, phonenumber");
  
      // 🔹 Query by email if provided
      if (email) {
        query = query.eq("email", email);
      } 
      // 🔹 Query by ID if provided
      else if (id) {
        query = query.eq("cognito_id", id);
      }
  
      // 🔹 Execute the query and fetch the user
      const { data, error, count } = await query;
  
      // 🔹 Handle errors from the query
      if (error) {
        throw new InternalServerErrorException("Database query failed. Please try again later.");
      }
  
      // 🔹 Handle case when no user is found
      if (!data || data.length === 0) {
        throw new NotFoundException(`User not found with ${email ? "email: " + email : "ID: " + id}`);
      }
  
      // 🔹 Handle case when multiple rows are returned
      if (data.length > 1) {
        throw new InternalServerErrorException("Multiple users found with the same criteria. Please check the data integrity.");
      }
  
      return data[0];  // Return the first (and only) user found
  
    } catch (error) {
      // 🔹 Log the error for debugging
      
      // 🔹 Throw a more specific error
      throw new InternalServerErrorException("An error occurred while fetching user information. Please try again.");
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
  
  async getTotalUsers(): Promise<number> {
    try {
      const userPoolId = this.configService.get<string>("COGNITO_USER_POOL_ID");

      if (!userPoolId) {
        throw new InternalServerErrorException("Cognito User Pool ID is not defined.");
      }

      const command = new ListUsersCommand({ UserPoolId: userPoolId });

      const response = await this.cognitoClient.send(command);

      return response.Users?.length || 0;
    } catch (error) {
      throw new InternalServerErrorException("Failed to fetch users from Cognito");
    }
  }

  async updateUserProfile(identifier: string, updateUserDto: UpdateUserProfileDto) {
    try {
      
      // Ensure identifier is valid before making the query
      if (!identifier) {
        throw new BadRequestException("Invalid identifier provided");
      }
  
      // Query to find the user by email (only using email now)
      const { data: user, error: findError } = await this.supabase
        .from("users")
        .select("*")
        .eq("email", identifier)  // Only query by email
        .single(); // Expecting a single user (fail if multiple rows found)
  
      // Handle errors in finding the user
      if (findError) {
        throw new InternalServerErrorException("Failed to find user in Supabase");
      }
  
      // Log user information for debugging
  
      // If no user is found, throw a BadRequestException
      if (!user) {
        throw new BadRequestException("User not found in Supabase.");
      }

  
      // Build the update fields dynamically, avoiding overwriting with `undefined`
      const updateFields: Record<string, any> = {};
  
      if (updateUserDto.firstname) updateFields.firstname = updateUserDto.firstname;
      if (updateUserDto.lastname) updateFields.lastname = updateUserDto.lastname;
      if (updateUserDto.phonenumber) updateFields.phonenumber = updateUserDto.phonenumber;
      if (updateUserDto.zipcode) updateFields.zipcode = updateUserDto.zipcode;
      if (updateUserDto.email) updateFields.email = updateUserDto.email;
  
      // If no fields are provided for updating, throw an error
      if (Object.keys(updateFields).length === 0) {
        console.error("❌ No valid attributes provided for update.");
        throw new BadRequestException("No valid attributes provided for update.");
      }
  
      // Perform the update in Supabase
      const { data, error } = await this.supabase
        .from("users")
        .update(updateFields)
        .eq("email", identifier)  // Assuming you're updating by email
        .select(); // Fetch updated record

  
      // Handle errors in the update operation
      if (error) {
        throw new InternalServerErrorException("Failed to update user in Supabase");
      }
  
      // Return success response with updated user data
      return {
        message: "User profile updated successfully",
        supabaseData: data, // Return updated data
      };
    } catch (error) {
      console.error("❌ Error updating user profile:", error.message);
      throw new InternalServerErrorException("Failed to update user profile");
    }
  }
  
}