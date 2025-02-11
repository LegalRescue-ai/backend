/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { ForgotPasswordModule } from './forgotpassword/forgotpassword.module';
import { CaseSubmissionModule } from './casesubmission/casesubmission.module';

@Module({
  imports: [  
    ConfigModule.forRoot({
      isGlobal: true,  // Makes the config global so it's accessible everywhere
    }),
    AuthModule, // AuthModule already provides JwtStrategy
    ForgotPasswordModule,
    CaseSubmissionModule,
  ],
})
export class AppModule {}
