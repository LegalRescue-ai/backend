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
  
    console.log('✅ Supabase initialized:', this.supabase ? 'Success' : 'Failed');
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
  handleCognitoError(error: any) {
    throw new Error('Method not implemented.');
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
      console.log(`Received request for user with email: ${email}, id: ${id}`);
  
      // 🔹 Initialize Supabase client
      const supabase = this.supabaseService.getClient();
      console.log("✅ Supabase client retrieved successfully.");
  
      // 🔹 Build query based on email or id
      let query = supabase.from("users").select("cognito_id, email, firstname, lastname, zipcode, phonenumber");
  
      // 🔹 Query by email if provided
      if (email) {
        console.log("🔹 Filtering by email:", email);
        query = query.eq("email", email);
      } 
      // 🔹 Query by ID if provided
      else if (id) {
        console.log("🔹 Filtering by user ID:", id);
        query = query.eq("cognito_id", id);
      }
  
      // 🔹 Execute the query and fetch the user
      const { data, error, count } = await query;
  
      // 🔹 Handle errors from the query
      if (error) {
        console.error("❌ Supabase query error:", error);
        throw new InternalServerErrorException("Database query failed. Please try again later.");
      }
  
      // 🔹 Handle case when no user is found
      if (!data || data.length === 0) {
        console.log(`🔹 No user found with ${email ? "email: " + email : "ID: " + id}`);
        throw new NotFoundException(`User not found with ${email ? "email: " + email : "ID: " + id}`);
      }
  
      // 🔹 Handle case when multiple rows are returned
      if (data.length > 1) {
        console.log("❌ Multiple users found with the same criteria. Please check the data integrity.");
        throw new InternalServerErrorException("Multiple users found with the same criteria. Please check the data integrity.");
      }
  
      console.log("✅ User found:", data[0]);
      return data[0];  // Return the first (and only) user found
  
    } catch (error) {
      // 🔹 Log the error for debugging
      console.error("❌ Error during user fetch:", error);
      
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
      console.error("❌ Error fetching users from Cognito:", error);
      throw new InternalServerErrorException("Failed to fetch users from Cognito");
    }
  }

  async updateUserProfile(identifier: string, updateUserDto: UpdateUserProfileDto) {
    try {
      console.log("🔍 Checking if user exists in Supabase...");
      
      // Ensure identifier is valid before making the query
      if (!identifier) {
        console.error("❌ Invalid identifier provided:", identifier);
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
        console.error("❌ Error finding user in Supabase:", findError.message);
        throw new InternalServerErrorException("Failed to find user in Supabase");
      }
  
      // Log user information for debugging
      console.log("👀 User found:", user);
  
      // If no user is found, throw a BadRequestException
      if (!user) {
        console.error("❌ No user found for identifier:", identifier);
        throw new BadRequestException("User not found in Supabase.");
      }
  
      console.log("🔄 Updating user with identifier:", identifier);
      console.log("📊 Update data:", updateUserDto);
  
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
  
      // Log Supabase update response
      console.log("🟢 Supabase update response:", data, error);
  
      // Handle errors in the update operation
      if (error) {
        console.error("❌ Error updating user in Supabase:", error.message);
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