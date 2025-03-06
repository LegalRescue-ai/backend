/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  UsePipes,
  Get,
  Query,
  Param,
} from '@nestjs/common';
import { AttorneyAuthService } from './attorney-auth.service';
import { AttorneySignUpDTO } from 'src/waitlist/dto/attorney_signUp_dto';
import { UpdateAttorneyDto } from 'src/waitlist/dto/attorney_Update_dto copy';
import { ValidationConfig } from 'src/config';

@Controller('auth')
export class AttorneyAuthController {
  constructor(private readonly attorneyService: AttorneyAuthService) {}

  @Post('/attorney/signup')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(ValidationConfig)
  async signUpAttorney(@Body() body: { data: AttorneySignUpDTO }) {
    try {
      const { data } = body;
      data.isActive = false;
      const response = await this.attorneyService.signUpAttorney(data);
      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('/attorney/signin')
  @HttpCode(HttpStatus.OK)
  @UsePipes(ValidationConfig)
  async signInAttorney(@Body() body: { email: string }) {
    try {
      const { email } = body;
      const attorneyUser = await this.attorneyService.signInAttorney(email);
      if (!attorneyUser) {
        throw new HttpException(
          `User with email ${email} was not found`,
          HttpStatus.NOT_FOUND,
        );
      }
      return attorneyUser;
    } catch (error) {
      this.handleError(error);
    }
  }

  @Patch('/attorney/update')
  @HttpCode(HttpStatus.OK)
  @UsePipes(ValidationConfig)
  async updateAttorney(
    @Body() body: { email: string; data: UpdateAttorneyDto },
  ) {
    try {
      const { email, data } = body;
      const updatedUser = await this.attorneyService.updateAttorneyDetails(
        email,
        data,
      );
      if (!updatedUser) {
        throw new HttpException(
          `User with email ${email} was not found`,
          HttpStatus.NOT_FOUND,
        );
      }
      return updatedUser;
    } catch (error) {
      this.handleError(error);
    }
  }

  @Delete('/attorney/delete')
  @HttpCode(HttpStatus.OK)
  @UsePipes(ValidationConfig)
  async deleteAttorney(@Body() body: { email: string }) {
    try {
      const { email } = body;
      const response = await this.attorneyService.deleteAttorney(email);
      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('/attorney/getAll')
  @HttpCode(HttpStatus.OK)
  async getAllAttorneys(
    @Query()
    query: {
      page?: number;
      limit?: number;
      state?: string;
      practiceArea?: string;
      accountType?: string;
      subscriptionStatus?: string;
      isActive?: boolean;
      sortBy?: string;
    },
  ) {
    const {
      page = 1,
      limit = 10,
      state,
      practiceArea,
      accountType,
      subscriptionStatus,
      isActive,
      sortBy = 'lastName',
    } = query;
    const attorneys = await this.attorneyService.getAllAttorneys({
      page,
      limit,
      state,
      practiceArea,
      accountType,
      subscriptionStatus,
      isActive,
      sortBy,
    });
    return attorneys;
  }

  @Get('/attorney/:id')
  @HttpCode(HttpStatus.OK)
  async getAttorneyById(@Param('id') id: string) {
    try {
      const attorney = await this.attorneyService.getAttorneyById(id);
      if (!attorney) {
        throw new HttpException(
          `Attorney with id ${id} was not found`,
          HttpStatus.NOT_FOUND,
        );
      }
      return attorney;
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: any) {
    console.error('Attorney Auth Error:', error);
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException(
      error.message || 'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
