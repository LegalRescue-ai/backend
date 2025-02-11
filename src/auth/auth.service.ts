/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { CognitoService } from "../cognito/cognito.service";
import { CreateAuthDto } from "../auth/dto/create-auth.dto";
import { UpdateUserProfileDto } from "./dto/update-auth.dto";
import { LoginUserDto } from "./dto/login_user.dto";

@Injectable()
export class AuthService{
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
      console.log('AuthService - loginUser:', loginUserDto);

      const { username, password } = loginUserDto;
      const response = await this.cognitoService.loginUser(username, password);

      console.log('AuthService - Login successful:', response);
      return response;
    } catch (error) {
      console.error('AuthService - Login error:', error);

      throw new HttpException(
        error.message || 'Invalid login credentials',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  
  findAll() {
    return `This action returns all auth`;
  }

  findOne(id: number) {
    return `This action returns a #${id} auth`;
  }

  update(id: number, updateAuthDto: UpdateUserProfileDto) {
    console.log(updateAuthDto);
    return `This action updates a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }
}
function someCognitoSignUpFunction(registerUserDto: CreateAuthDto) {
  throw new Error("Function not implemented.");
}

