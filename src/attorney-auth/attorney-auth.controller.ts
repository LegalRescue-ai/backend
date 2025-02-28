/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  UsePipes,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Res,
  Req,
} from '@nestjs/common';
import { AttorneyAuthService } from './attorney-auth.service';
import { AttorneySignUpDTO } from 'src/attorney-auth/dto/attorney_signUp_dto';
import { UpdateAttorneyDto } from 'src/attorney-auth/dto/attorney_Update_dto copy';
import { ValidationConfig } from 'src/config';
import { CreateAuthDto } from 'src/cognito/dto/create-auth.dto';
import { LoginUserDto } from 'src/cognito/dto/login_user.dto';
import { CognitoService } from 'src/cognito/cognito.service';
import { JwtAuthGuard } from 'src/Guards/auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import {Response} from 'express'


@Controller('auth')
export class AttorneyAuthController {
  constructor(
    private readonly attorneyService: AttorneyAuthService,
    private cognitoService: CognitoService,
  ) {}

 

  @Post('/register')
  async register(@Body() registerUserDto: CreateAuthDto) {
    return this.cognitoService.registerAttorneyUser(registerUserDto);
  }
  @Post('/confirmSignUp')
  async confirmSignUp(
    @Body('email') email: string,
    @Body('confirmationCode') confirmationCode: string,
  ) {
    return this.cognitoService.confirmAttorneySignUp(email, confirmationCode);
  }

  @Post('/resendCode')
  async resendConfirmationCode(
    @Body('email') email:string,
  ){
    return this.cognitoService.resendAttorneyConfirmationCode(email)
  }

  
  @Post('/login')
  async signin(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.cognitoService.loginAttorneyUser(
      loginUserDto.username,
      loginUserDto.password,
    );
    
   
    if (result.IdToken) {
     
      response.cookie('idToken', result.IdToken, {
        httpOnly: true,
        secure:true,
        sameSite: 'none',
        path: '/',
        maxAge: 60 * 60 * 1000 
      });
      
     
      if (result.RefreshToken) {
        response.cookie('refreshToken', result.RefreshToken, {
          httpOnly: true,
          secure:true,
          sameSite: 'none', 
          path: '/', 
          maxAge: 30 * 24 * 60 * 60 * 1000 
        });
      }
    }
    

    return {
      success: true,
      message: 'Login successful',
      email: loginUserDto.username,
      expiresIn: result.ExpiresIn
    };
  }

  @Post('/refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Req() request:any, @Res({passthrough:true}) response: Response){
    const refreshToken = request.cookies['refreshToken']
    const credentials = Buffer.from(`${process.env.COGNITO_CLIENT_ID}:${process.env.COGNITO_CLIENT_SECRET}`).toString('base64');

    if(!refreshToken){
      throw new HttpException('No refresh token provided', HttpStatus.UNAUTHORIZED);  
    }

    try{
      const tokenEndpoint = `${process.env.COGNITO_DOMAIN}/oauth2/token`

      const tokenResponse = await fetch(tokenEndpoint, {
       method: 'POST',
       headers: {'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
       },
       body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.COGNITO_CLIENT_ID,
        refresh_token: refreshToken,
       }),
      });
      
      
      if(!tokenResponse.ok){
        throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
      }

      const tokens = await tokenResponse.json()

      if(tokens.id_token){
        response.cookie('idToken', tokens.id_token, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          maxAge: 60 * 60 *1000
        })
      }

      return {success: true}


    }catch(error:any){
      console.error('Error refreshing token:', error)
      throw new HttpException('Failed to refresh token', HttpStatus.UNAUTHORIZED)
    }
  }


  @Post('/attorney/signup')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(ValidationConfig)
  async signUpAttorney(@Body() body: { data: AttorneySignUpDTO }) {
    try {
      const { data } = body;
      data.isActive = false;
      const response = await this.attorneyService.signUpAttorney(data);
      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('/create-checkout-session')
  async createCheckoutSession(
    @Body()
    body: {
      basePrice: number;
      attorneyId: string;
      customerEmail: string;
      statesLicensing: { barLicenseNumber: string }[];
    },
  ) {
    const { basePrice, customerEmail, attorneyId, statesLicensing } = body;
    const session = await this.attorneyService.registerAttorneySubscription(
      customerEmail,
      attorneyId,
      basePrice,
      statesLicensing,
    );
    return { url: session.url };
  }


 
  @Post('/attorney/getAttorneyData')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UsePipes(ValidationConfig)
  async getData(@Request() req:any) {
    try {
      const email = req.user.email;
      const attorneyUser = await this.attorneyService.getAttorneyData(email);
      if (!attorneyUser) {
        throw new HttpException(
          `User with email ${email} was not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        data: attorneyUser,
        newAccessToken: req.newAccessToken || null
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Patch('/attorney/update')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UsePipes(ValidationConfig)
  async updateAttorney(
    @Request() req:any,
    @Body() body: { data: UpdateAttorneyDto },
  ) {
    try {
      const email = req.user.email;
      const { data } = body;
      const updatedUser = await this.attorneyService.updateAttorneyDetails(
        email,
        data,
      );
      if (!updatedUser) {
        throw new HttpException(
          `User with email ${email} was not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        data: updatedUser,
        newAccessToken: req.newAccessToken || null
      };
    } catch (error) {
      this.handleError(error);
    }
  }


  @Post("/attorney/upload-picture")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Request()  req:any,
    @Body("attorneyId") attorneyId: string,
  ) {
    const email = req.user.email;
    return  this.attorneyService.uploadImage(file, attorneyId, email);
  }


  @Delete('/attorney/delete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UsePipes(ValidationConfig)
  async deleteAttorney(@Request() req) {
    try {
      const email = req.user.email;
      const response = await this.attorneyService.deleteAttorney(email);

      return {
        data: response,
        newAccessToken: req.newAccessToken || null
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('forgot-password/initiate')
  @HttpCode(HttpStatus.OK)
  async initiatePasswordReset(@Body() { email }: { email: string }) {
    return await this.cognitoService.initiateAttorneyForgotPassword(email);
  }

  @Post('forgot-password/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(
    @Body() { email, code, newPassword }: { email: string; code: string; newPassword: string },
  ) {
    return await this.cognitoService.confirmAttorneyForgotPassword(
      email,
      code,
      newPassword,
    );
  }

@Post('attorney/change-password')
@UseGuards(JwtAuthGuard)
@HttpCode(HttpStatus.OK)
async changePassword(
  @Request() req:any,
  @Body() body: { oldPassword: string; newPassword: string }
) {
  const { oldPassword, newPassword } = body;
  const email = req.user.email;
  return await this.cognitoService.changeAttorneyPassword(
    email,
    oldPassword,
    newPassword
  );
}

@Post('/logout')
@HttpCode(HttpStatus.OK)
async logout(@Res({passthrough: true}) response:Response){
  response.clearCookie('idToken', {path: '/'});
  response.clearCookie('refreshToken', {path: '/'});;

  return {success:true}
}



  private handleError(error: any) {
    console.error('Attorney Auth Error:', error);
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException(
      error.message || 'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
