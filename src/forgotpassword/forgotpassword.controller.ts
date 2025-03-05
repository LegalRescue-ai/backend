/* eslint-disable prettier/prettier */
import { Controller, Post, Body } from '@nestjs/common';
import { ForgotPasswordService } from './forgotpassword.service';

@Controller('authentication')
export class ForgotPasswordController {
  constructor(private readonly forgotPasswordService: ForgotPasswordService) {}

  @Post('send-otp')
  async sendOtp(@Body('email') email: string): Promise<string> {
    await this.forgotPasswordService.sendOtp(email);
    return 'OTP sent successfully!';
  }

  @Post('verify-otp')
  async verifyOtp(@Body('email') email: string, @Body('otp') otp: string): Promise<string> {
    await this.forgotPasswordService.verifyOtp(email, otp);
    return 'OTP verified successfully!';
  }

  @Post('reset-password')
  async resetPassword(
    @Body('email') email: string,
    @Body('password') password: string,
  ): Promise<string> {
    // Call the service to reset the password in Cognito
    await this.forgotPasswordService.resetPassword(email, password);
    return 'Password reset successfully!';
  }
}
