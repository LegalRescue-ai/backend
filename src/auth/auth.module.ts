/* eslint-disable prettier/prettier */
import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { CognitoModule } from "../cognito/cognito.module";
import { AuthService } from "./auth.service";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "@nestjs/config";

@Module({
  controllers: [AuthController],
  imports: [
    CognitoModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET, // Ensure your secret key is stored in environment variables
      signOptions: { expiresIn: "1h" }, // Token expiration time
    }),
    ConfigModule, // Include ConfigModule to load environment variables
  ],
  providers: [AuthService], // Provide the JwtStrategy here
})
export class AuthModule {}
