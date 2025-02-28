/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as AWS from 'aws-sdk';
import { config } from 'dotenv'; // To load environment variables

// Load environment variables from .env file if not already loaded
config();

@Injectable()
export class ForgotPasswordService {
  private otpStorage = new Map<string, { otp: string, expiresAt: number }>(); // Store OTP with expiration time

  cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider;

  constructor(private readonly mailerService: MailerService) {
    // Initialize AWS Cognito SDK with explicit access keys and region from environment variables
    AWS.config.update({
      region: process.env.REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Use environment variable for Access Key ID
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Use environment variable for Secret Access Key
    });

    this.cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();
  }

  // Send OTP to the provided email address
  async sendOtp(email: string): Promise<void> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit OTP
    const expiresAt = Date.now() + 5 * 60 * 1000; // OTP expires in 5 minutes

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

  // Verify OTP and check if it is valid and not expired
  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const storedOtp = this.otpStorage.get(email);

    if (!storedOtp) {
      throw new BadRequestException('OTP not found or expired.');
    }

    // Check if OTP is expired
    if (Date.now() > storedOtp.expiresAt) {
      this.otpStorage.delete(email); // Clean up expired OTPs
      throw new BadRequestException('OTP has expired.');
    }

    // Check if OTP matches
    if (storedOtp.otp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    this.otpStorage.delete(email); // Remove OTP after successful verification
    return true;
  }

  // Method to reset password using Cognito API
  async resetPassword(email: string, newPassword: string): Promise<void> {
    const params = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID, // Get UserPoolId from environment variable
      Username: email,
      Password: newPassword,
      Permanent: true, // Set to true to indicate a permanent password change
    };

    try {
      await this.cognitoIdentityServiceProvider.adminSetUserPassword(params).promise();
    } catch (error) {
      console.error('Error resetting password in Cognito:', error);
      throw new InternalServerErrorException('Failed to reset password in Cognito. Please try again later.');
    }
  }
}
