/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { CognitoModule } from '../cognito/cognito.module'; // ✅ Import CognitoModule
import { SupabaseModule } from '../casesubmission/supabase.module'; 
import { S3Client } from '@aws-sdk/client-s3';

@Module({
  imports: [CognitoModule, SupabaseModule], // ✅ Import CognitoModule instead of manually providing CognitoService
  controllers: [AuthController],
  providers: [AuthService, S3Client], // ✅ Remove CognitoService from providers
})
export class AuthModule {}
