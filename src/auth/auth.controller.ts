/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  Patch,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { UpdateUserProfileDto } from './dto/update-auth.dto';
import { CreateAuthDto } from '../auth/dto/create-auth.dto';
import { CognitoService } from '../cognito/cognito.service';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login_user.dto';

import { JwtService } from "@nestjs/jwt"; // Ensure this is imported

@Controller('auth')
export class AuthController {
  supabase: any;
  jwt: any;
  jwtService: any;
  supabaseService: any;
  constructor(
    private readonly cognitoService: CognitoService,
    private readonly authService: AuthService,
  ) {}


  @Post('register')
  async register(@Body() registerUserDto: CreateAuthDto) {
    try {
      const registerResponse = await this.cognitoService.registerUser(registerUserDto);

      if (!registerResponse || !registerResponse.success || !registerResponse.userId) {
        throw new BadRequestException(registerResponse?.message || 'Registration failed');
      }

      // Fetch user info from Supabase using Cognito ID
      const userInfo = await this.cognitoService.getUserInfo(registerResponse.userId);

      return {
        message: 'User registered successfully',
        user: {
          firstName: userInfo.firstname,
          lastName: userInfo.lastname,
          email: userInfo.email,
          zipCode: userInfo.zipcode,
          phoneNumber: userInfo.phonenumber,
        },
      };
    } catch (error) {
      console.error('Registration Error:', error);
      throw new InternalServerErrorException(error.message || 'An unexpected error occurred');
    }
  }


  @Post('/confirmSignUp') 
  async confirmSignUp(
    @Body('email') email: string,
    @Body('confirmationCode') confirmationCode: string
  ) {
    if (!email || !confirmationCode) {
      throw new BadRequestException('Email and confirmation code are required.');
    }
  
    return await this.cognitoService.confirmSignUp(email, confirmationCode);
  }

  @Post('/login')
  async signin(@Body() loginUserDto: LoginUserDto) {
    try {
      console.log('Login request received:', loginUserDto);

      const response = await this.authService.loginUser(loginUserDto);
      console.log('Login successful:', response);

      return response;
    } catch (error) {
      console.error('Login failed:', error);

      throw new HttpException(
        error.message || 'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('resend')
  async resendConfirmationCode(@Body('email') email: string): Promise<any> {
    if (!email) {
      throw new BadRequestException('Email address is required.');
    }

    try {
      const response = await this.cognitoService.resendConfirmationCode(email);
      return {
        success: true,
        message: response.message,
      };
    } catch (error) {
      console.error('Error in /resend-confirmation-code:', error.message);

      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(error.message);
      }
      throw new InternalServerErrorException(
        'Could not process your request. Please try again later.',
      );
    }
  }

  @Get('user-count')
  async getTotalRegisteredUsers() {
    try {
      const totalUsers = await this.cognitoService.getTotalUsers();
      return {
        message: 'Total number of registered users',
        data: totalUsers,
      };
    } catch (error) {
      throw new InternalServerErrorException('Error retrieving user count');
    }
  }


  @Get("/user")
  async getUserInfo(@Query("email") email?: string, @Query("id") id?: string) {
    if (!email && !id) {
      throw new BadRequestException("Email or user ID is required.");
    }

    try {
      let query = this.supabaseService.getClient().from("users").select("firstName, lastName, email, zipCode, phoneNumber");

      if (email) {
        query = query.eq("email", email);
      } else if (id) {
        query = query.eq("cognito_id", id);
      }

      const { data: user, error } = await query.single();

      if (error || !user) {
        throw new NotFoundException("User not found in Supabase.");
      }

      return user;
    } catch (error) {
      console.error("❌ Error fetching user:", error);
      throw new InternalServerErrorException("Error fetching user information.");
    }
  }

  @Patch("/update-user")
  async updateUser(@Req() req, @Body() updateUserDto: UpdateUserProfileDto) {
    const userEmail = req.user.email; // Extracted from JWT

    if (!userEmail) {
      throw new BadRequestException("Email is required.");
    }

    try {
      return await this.cognitoService.updateUserProfile(userEmail, updateUserDto);
    } catch (error) {
      throw new InternalServerErrorException("Error updating user information");
    }
  }
}
