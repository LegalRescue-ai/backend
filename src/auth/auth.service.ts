/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, HttpException, HttpStatus, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from "@nestjs/common";
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
  private readonly bucketName = 'profile-pictures' 
    constructor(private readonly cognitoService: CognitoService, ){}

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

  


  }
function someCognitoSignUpFunction(registerUserDto: CreateAuthDto) {
  throw new Error("Function not implemented.");
}

