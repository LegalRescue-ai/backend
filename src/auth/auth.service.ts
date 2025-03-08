/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CognitoService } from '../cognito/cognito.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginUserDto } from './dto/login_user.dto';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  private readonly logger = console; 

  constructor(
    private readonly cognitoService: CognitoService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async registerUser(
    registerUserDto: CreateAuthDto,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      await this.cognitoService.registerUser(registerUserDto);
      return { success: true, message: 'User registered successfully.' };
    } catch (error) {
      this.logger.error('Registration error:', error);
      return {
        success: false,
        message: error.message || 'User registration failed.',
      };
    }
  }

  async loginUser(loginUserDto: LoginUserDto) {
    try {
      const { username, password } = loginUserDto;
      return await this.cognitoService.loginUser(username, password);
    } catch (error) {
      this.logger.error('Login error:', error);
      throw new UnauthorizedException(error.message || 'Invalid login credentials.');
    }
  }

  async getUserInfo(idToken: string): Promise<any> {
    try {
      if (!idToken) {
        throw new UnauthorizedException('ID Token is missing.');
      }

      const decodedToken = jwt.decode(idToken) as any;
      if (!decodedToken?.sub) {
        throw new UnauthorizedException('Invalid or expired ID token.');
      }

      const cognitoId = decodedToken.sub;

      const user = await this.supabaseService.getUserByCognitoId(cognitoId);
      if (!user) {
        throw new NotFoundException('User not found in database.');
      }

      return user;
    } catch (error) {
      console.error(`Error fetching user info: ${error.message}`);

      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Error fetching user info.');
    }
  }
  
  
  async refreshAccessToken(refreshToken: string): Promise<any> {
    try {
      const newTokens = await this.cognitoService.refreshToken(refreshToken);
      if (!newTokens) {
        throw new UnauthorizedException('Unable to refresh token.');
      }
      return newTokens;
    } catch (error) {
      this.logger.error('Error refreshing access token:', error);
      throw new InternalServerErrorException('Error refreshing access token.');
    }
  }

  async changePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      if (!accessToken) throw new Error('Access token is required.');
      if (!currentPassword || !newPassword) {
        throw new Error('Both current and new passwords are required.');
      }

      await this.cognitoService.changeUserPassword(
        accessToken,
        currentPassword,
        newPassword,
      );
      return { success: true, message: 'Password changed successfully.' };
    } catch (error) {
      this.logger.error('Error changing password:', error);
      return {
        success: false,
        message: error.message || 'Failed to change password.',
      };
    }
  }
}
