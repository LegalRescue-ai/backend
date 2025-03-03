/* eslint-disable prettier/prettier */
import { Injectable, Logger, InternalServerErrorException, NotFoundException, UnauthorizedException, HttpException, HttpStatus, BadRequestException } from "@nestjs/common";
import { CognitoService } from "../cognito/cognito.service";
import { CreateAuthDto } from "../auth/dto/create-auth.dto";
import { UpdateUserProfileDto } from "./dto/update-auth.dto";
import { LoginUserDto } from "./dto/login_user.dto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SupabaseClient } from "@supabase/supabase-js";
import { ChangePasswordDto } from "./dto/change-password.dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bucketName = "myclientprofilepictureimages";

  constructor(
    private readonly cognitoService: CognitoService,
    private readonly s3Client: S3Client, // Ensure correct injection
    private readonly supabaseClient: SupabaseClient // Ensure correct injection
  ) {}

  async registerUser(registerUserDto: CreateAuthDto): Promise<{ success: boolean; message?: string }> {
    try {
      await this.cognitoService.registerUser(registerUserDto);
      return { success: true };
    } catch (error) {
      this.logger.error(`Registration failed: ${error.message}`);
      throw new HttpException(error.message || "Registration failed", HttpStatus.BAD_REQUEST);
    }
  }

  async loginUser(loginUserDto: LoginUserDto) {
    try {
      const { username, password } = loginUserDto;
      return await this.cognitoService.loginUser(username, password);
    } catch (error) {
      this.logger.error(`Login error: ${error.message}`);
      throw new UnauthorizedException(error.message || "Invalid login credentials");
    }
  }

  async uploadImage(file: Express.Multer.File, clientId: string, email: string) {
    const client = await this.findClientByEmail(email);
    if (!client) {
      throw new NotFoundException("Client with the provided email was not found");
    }

    const fileName = `profile-images/${clientId}.jpg`;
    const params = {
      Bucket: this.bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    try {
      await this.s3Client.send(new PutObjectCommand(params)); // FIXED: Use this.s3Client
      const url = `https://${this.bucketName}.s3.amazonaws.com/${fileName}`;
      await this.updateClientDetails(email, { profile_picture: url });
      return { imageUrl: url, fileName };
    } catch (error) {
      this.logger.error(`Image upload failed: ${error.message}`);
      throw new InternalServerErrorException("Image upload failed");
    }
  }

  async findClientByEmail(email: string) {
    try {
      const { data, error } = await this.supabaseClient
        .from("users") // Ensure this is the correct table name
        .select("*")
        .eq("email", email)
        .single();

      if (error) {
        this.logger.error(`Supabase query error: ${error.message}`);
        throw new NotFoundException("Client not found");
      }

      return data;
    } catch (error) {
      this.logger.error(`findClientByEmail error: ${error.message}`);
      throw new InternalServerErrorException("Error fetching client data");
    }
  }

  async updateClientDetails(email: string, data: Partial<UpdateUserProfileDto>) {
    try {
      const client = await this.findClientByEmail(email);
      if (!client) {
        throw new NotFoundException("Client user not found");
      }

      const { error } = await this.supabaseClient
        .from("users") // Ensure this is the correct table name
        .update(data)
        .eq("email", email);

      if (error) {
        this.logger.error(`Supabase update error: ${error.message}`);
        throw new InternalServerErrorException("Failed to update client details");
      }

      return { success: true, message: "Profile updated successfully" };
    } catch (error) {
      this.logger.error(`Update process failed: ${error.message}`, { email, data });
      throw error;
    }
  }

  async changePassword(accessToken: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;
  
    try {
      const response = await this.cognitoService.changeUserPassword(accessToken, currentPassword, newPassword);
      return response;
    } catch (error) {
      this.logger.error(`Change password error: ${error.message}`);
      throw new BadRequestException(error.message || "Could not change password");
    }
  }  
}
