/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, HttpException, HttpStatus, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { CognitoService } from "../cognito/cognito.service";
import { CreateAuthDto } from "../auth/dto/create-auth.dto";
import { UpdateUserProfileDto } from "./dto/update-auth.dto";
import { LoginUserDto } from "./dto/login_user.dto";
import { Response } from 'express';

@Injectable()
export class AuthService{
  supabase: any;
  authService: any;
  userRepository: any;
  supabaseService: any;
    constructor(private readonly cognitoService: CognitoService){}

    async registerUser(registerUserDto: CreateAuthDto): Promise<{ success: boolean; message?: string }> {
      try {
        const response = await someCognitoSignUpFunction(registerUserDto);
        return { success: true };
      } catch (error) {
        return { success: false, message: error.message || 'Registration failed' };
      }
    }

    async loginUser(loginUserDto: LoginUserDto) {
      try {
  
        const { username, password } = loginUserDto;
        const response = await this.cognitoService.loginUser(username, password);
  
        return response;
      } catch (error) {
        console.error('AuthService - Login error:', error);
  
        throw new HttpException(
          error.message || 'Invalid login credentials',
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    async updateProfilePicture(cognito_id: string, filePath: string): Promise<any> {
      if (!this.supabaseService) {
        throw new InternalServerErrorException('SupabaseService is not initialized');
      }
    
      // Use cognito_id to fetch the user
      const user = await this.supabaseService.getUserByCognitoId(cognito_id);
    
      if (!user) {
        throw new InternalServerErrorException('User not found');
      }
    
      try {
        // Logic for updating the profile picture in your database or storage service
        user.profilePicture = filePath;
    
        // Update user record
        await this.supabaseService.updateUser(user);
    
        return user;
      } catch (error) {
        throw new InternalServerErrorException('Error updating profile picture');
      }
    }    
  }
function someCognitoSignUpFunction(registerUserDto: CreateAuthDto) {
  throw new Error("Function not implemented.");
}

