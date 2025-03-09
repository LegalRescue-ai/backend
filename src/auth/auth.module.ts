/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { CognitoModule } from '../cognito/cognito.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { S3Client } from '@aws-sdk/client-s3';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from '../jwt/jwt-strategy';

@Module({
  imports: [
    CognitoModule,
    SupabaseModule,
    PassportModule.register({ defaultStrategy: 'jwt' }), 
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-jwt-secret', 
      signOptions: { expiresIn: '1h' }, 
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, S3Client, JwtStrategy], 
  exports: [AuthService, JwtStrategy, PassportModule, JwtModule], 
})
export class AuthModule {}
