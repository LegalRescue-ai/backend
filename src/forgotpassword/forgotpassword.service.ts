/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as AWS from 'aws-sdk';
import { config } from 'dotenv'; 

config();

@Injectable()
export class ForgotPasswordService {
  private otpStorage = new Map<string, { otp: string, expiresAt: number }>(); 
  cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider;

  constructor(private readonly mailerService: MailerService) {
    AWS.config.update({
      region: process.env.REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID, 
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, 
    });

    this.cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();
  }

  async sendOtp(email: string): Promise<void> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); 
    const expiresAt = Date.now() + 5 * 60 * 1000; 

    this.otpStorage.set(email, { otp, expiresAt });

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset OTP',
        text: `Your OTP is ${otp}`,
        html: `<p>Your OTP is <strong>${otp}</strong></p>`,
      });
    } catch (error) {
      console.error('Error sending OTP email:', error);
      throw new InternalServerErrorException('Failed to send OTP. Please try again later.');
    }
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const storedOtp = this.otpStorage.get(email);

    if (!storedOtp) {
      throw new BadRequestException('OTP not found or expired.');
    }

    if (Date.now() > storedOtp.expiresAt) {
      this.otpStorage.delete(email); 
      throw new BadRequestException('OTP has expired.');
    }

    if (storedOtp.otp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    this.otpStorage.delete(email); 
    return true;
  }


  async resetPassword(email: string, newPassword: string): Promise<void> {
    const params = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID, 
      Username: email,
      Password: newPassword,
      Permanent: true, 
    };

    try {
      await this.cognitoIdentityServiceProvider.adminSetUserPassword(params).promise();
    } catch (error) {
      console.error('Error resetting password in Cognito:', error);
      throw new InternalServerErrorException('Failed to reset password in Cognito. Please try again later.');
    }
  }
}
