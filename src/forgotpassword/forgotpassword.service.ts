/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class ForgotPasswordService {
  private otpStorage = new Map<string, string>(); // Replace with a proper database for production.

  constructor(private readonly mailerService: MailerService) {}

  async sendOtp(email: string): Promise<void> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit OTP
    this.otpStorage.set(email, otp);

    await this.mailerService.sendMail({
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP is ${otp}`,
      html: `<p>Your OTP is <strong>${otp}</strong></p>`,
    });
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const storedOtp = this.otpStorage.get(email);
    if (!storedOtp || storedOtp !== otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    this.otpStorage.delete(email); // Remove OTP after successful verification
    return true;
  }

  async resetPassword(email: string, password: string): Promise<void> {
    // Replace with your database logic
    console.log(`Password for ${email} is now: ${password}`);
  }
}
