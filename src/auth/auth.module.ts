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
    PassportModule.register({ defaultStrategy: 'jwt' }), // ✅ Register Passport with default 'jwt' strategy
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-jwt-secret', // ✅ Use env variable for security
      signOptions: { expiresIn: '1h' }, // Adjust token expiration
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, S3Client, JwtStrategy], // ✅ Ensure JwtStrategy is provided
  exports: [AuthService, JwtStrategy, PassportModule, JwtModule], // ✅ Export modules for usage
})
export class AuthModule {}
