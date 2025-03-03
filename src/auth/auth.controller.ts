/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-wrapper-object-types */
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
  UploadedFile,
  UseInterceptors,
  Res,
  Request,
  Logger,
} from '@nestjs/common';

import { UpdateUserProfileDto } from './dto/update-auth.dto';
import { CreateAuthDto } from '../auth/dto/create-auth.dto';
import { CognitoService } from '../cognito/cognito.service';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login_user.dto';
import { SupabaseService } from '../casesubmission/supabase.service';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('authenticate')
export class AuthController {
  userService: any;
  supabaseUrl = process.env.SUPABASE_URL;
  supabase: any;
  logger: any;
  constructor(
    private readonly cognitoService: CognitoService,
    private readonly authService: AuthService,
    private readonly supabaseService: SupabaseService, // ✅ Properly Injected
  ) {}

  @Post('register')
  async register(@Body() registerUserDto: CreateAuthDto) {
    try {
      const registerResponse = await this.cognitoService.registerUser(registerUserDto);
    } catch (error) {
      throw new InternalServerErrorException(error.message || 'An unexpected error occurred');
    }
  }

  @Post('/confirmSignUp')
  async confirmSignUp(
    @Body('email') email: string,
    @Body('confirmationCode') confirmationCode: string,
  ) {
    if (!email || !confirmationCode) {
      throw new BadRequestException('Email and confirmation code are required.');
    }

    return await this.cognitoService.confirmSignUp(email, confirmationCode);
  }

  @Post('/login')
  async signin(@Body() loginUserDto: LoginUserDto) {
    try {
      const response = await this.authService.loginUser(loginUserDto);

      return response;
    } catch (error) {
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

      if (totalUsers === undefined || totalUsers === null) {
        throw new InternalServerErrorException('Failed to retrieve user count.');
      }

      return {
        message: 'Total number of registered users',
        data: totalUsers,
      };
    } catch (error) {
      throw new InternalServerErrorException('Error retrieving user count');
    }
  }

  @Get('/user')
  async getUserInfo(@Query('email') email?: string, @Query('id') id?: string) {
    // 🔹 Check if either email or ID is provided, throw BadRequest if neither is available
    if (!email && !id) {
      throw new BadRequestException('Either email or user ID is required.');
    }

    try {
      const supabase = this.supabaseService.getClient();

      // 🔹 Clean email (remove any spaces or leading/trailing characters)
      if (email) {
        email = email.trim();
      }

      // 🔹 Build the query based on the presence of email or ID
      let query = supabase
        .from('users')
        .select('cognito_id, email, firstname, lastname, zipcode, phonenumber');

      if (email) {
        query = query.eq('email', email); // Filtering by email
      } else if (id) {
        query = query.eq('cognito_id', id); // Filtering by ID
      }

      // 🔹 Execute the query and limit to one result
      const { data, error } = await query.limit(1); // Limit to 1 row, without calling .single()

      // 🔹 Handle query errors
      if (error) {
        throw new InternalServerErrorException('Database query failed. Please try again later.');
      }

      // 🔹 Handle case when no user is found
      if (!data || data.length === 0) {
        throw new NotFoundException(`No user found with ${email ? 'email: ' + email : 'ID: ' + id}`);
      }

      // 🔹 Handle case when more than one user is found (data integrity issue)
      if (data.length > 1) {
        throw new InternalServerErrorException(
          'Multiple users found with the same criteria. Please check data integrity.',
        );
      }

      // 🔹 Return the first user if exactly one user is found
      return data[0];
    } catch (error) {
      // 🔹 Throw specific errors
      if (error instanceof NotFoundException) {
        throw error; // Already a specific error message
      }
      throw new InternalServerErrorException(
        'An error occurred while fetching user information. Please try again.',
      );
    }
  }

  @Patch('update-user')
  async updateUser(
    @Body() updateUserDto: UpdateUserProfileDto,
    @Req() req,
    @Query('email') email?: string,
  ) {
    // Get identifier from query parameters or from the authenticated user
    const identifier = email || req.user?.email; // Now only using email

    // If no identifier found, throw BadRequestException
    if (!identifier) {
      throw new BadRequestException('Email is required.');
    }

    try {
      // Attempt to update user profile using the identifier
      return await this.cognitoService.updateUserProfile(identifier, updateUserDto);
    } catch (error) {
      // Log the complete error and throw a generic internal server error
      throw new InternalServerErrorException('Error updating user information');
    }
  }

  @Post('/upload-picture')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
    @Body('cognito_id') cognitoId: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }

    // Validate file type (only allow images)
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed.');
    }

    try {
      // Upload the file to Supabase
      const supabase = this.supabaseService.getClient();
      const filePath = `profile-pictures/${cognitoId}/${file.originalname}`;
      const { data, error } = await supabase.storage
        .from('profile-pictures')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
        });

      if (error) {
        throw new InternalServerErrorException('Failed to upload file to Supabase.');
      }

      // Return the file URL
      const fileUrl = `${this.supabaseUrl}/storage/v1/object/public/profile-pictures/${filePath}`;
      return { fileUrl };
    } catch (error) {
      throw new InternalServerErrorException('Error uploading profile picture.');
    }
  }


@Post("change-password")
async changePassword(
  @Body() changePasswordDto: ChangePasswordDto,
  @Req() req: Request // Use Express Request
) {
  try {
    const accessToken = req.headers["authorization"]?.split(" ")[1]; // Fix: Use correct key access
    if (!accessToken) {
      throw new UnauthorizedException("Access token is required");
    }

    await this.authService.changePassword(accessToken, changePasswordDto);
    return { success: true, message: "Password changed successfully!" };
  } catch (error) {
    this.logger.error(`Error changing password: ${error.message}`);
    throw new HttpException(
      error.message || "Failed to change password",
      HttpStatus.BAD_REQUEST
    );
  }
}
}