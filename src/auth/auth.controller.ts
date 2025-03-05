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
  UploadedFile,
  UseInterceptors,
  Res,
  Request,
  Logger,
  HttpCode,
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
import { JwtAuthGuard } from './auth.guard'; // Import the JwtAuthGuard
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('authenticate')
export class AuthController {
  userService: any;
  supabaseUrl = process.env.SUPABASE_URL;
  supabase: any;
  logger: any;
  constructor(
    private readonly cognitoService: CognitoService,
    private readonly authService: AuthService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Post('register')
  async register(@Body() registerUserDto: CreateAuthDto) {
    try {
      const registerResponse = await this.cognitoService.registerUser(registerUserDto);
      return registerResponse;
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

  
  @UseGuards(JwtAuthGuard)
  @Get('user')
  async getUserInfo(@Req() req) {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        throw new UnauthorizedException('Missing Authorization header.');
      }

      const idToken = authHeader.split(' ')[1];
      if (!idToken) {
        throw new UnauthorizedException('Invalid Authorization token format.');
      }

      const userInfo = await this.authService.getUserInfo(idToken);

      if (!userInfo) {
        throw new NotFoundException('User not found in database.');
      }

      return userInfo;
    } catch (error) {
      console.error(`Error fetching user info: ${error.message}`);

      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to fetch user info.');
    }
  }

  @Patch('update-user')
@UseGuards(JwtAuthGuard)
async updateUser(@Body() updateUserDto: UpdateUserProfileDto, @Req() req) {
  const user = req.user; // Extract user info from token
  const identifier = user.sub; // Use Cognito ID instead of email

  if (!identifier) {
    throw new BadRequestException('User ID is required.');
  }

  try {
    return await this.cognitoService.updateUserProfile(identifier, updateUserDto);
  } catch (error) {
    throw new InternalServerErrorException('Error updating user information');
  }
}

@Post('refresh-token')
@HttpCode(HttpStatus.OK)
async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
  const { refreshToken } = refreshTokenDto;
  
  try {
    const newAccessToken = await this.authService.refreshAccessToken(refreshToken);
    return { newToken: newAccessToken };
  } catch (error) {
    throw new Error('Could not refresh token: ' + error.message);
  }
}

@Post('/upload-picture')
@UseGuards(JwtAuthGuard)
@UseInterceptors(FileInterceptor('file'))
async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req) {
  console.log('Extracted user from token:', req.user); // Debugging
  if (!req.user) {
    throw new UnauthorizedException('User not authenticated');
  }

  if (!file) {
    throw new BadRequestException('No file uploaded.');
  }

  if (!file.mimetype.startsWith('image/')) {
    throw new BadRequestException('Only image files are allowed.');
  }

  try {
    const user = req.user;
    const supabase = this.supabaseService.getClient();
    const filePath = `profile-pictures/${user.sub}/${file.originalname}`;

    const { data, error } = await supabase.storage
      .from('profile-pictures')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

    if (error) {
      throw new InternalServerErrorException('Failed to upload file to Supabase.');
    }

    const fileUrl = `${this.supabaseUrl}/storage/v1/object/public/profile-pictures/${filePath}`;
    return { fileUrl };
  } catch (error) {
    throw new InternalServerErrorException('Error uploading profile picture.');
  }
}

@Post('change-password')
@UseGuards(JwtAuthGuard)
async changePassword(@Body() changePasswordDto: ChangePasswordDto, @Req() req) {
  try {
    const accessToken = req.headers['authorization']?.split(' ')[1];

    if (!accessToken) {
      throw new UnauthorizedException('Access token is required');
    }

    const { currentPassword, newPassword } = changePasswordDto;

    return await this.authService.changePassword(accessToken, currentPassword, newPassword);
  } catch (error) {
    throw new HttpException(error.message || 'Failed to change password', HttpStatus.BAD_REQUEST);
  }
}
}