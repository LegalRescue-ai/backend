/* eslint-disable prettier/prettier */
import {
  Controller,
  Post,
  Get,
  Body,
  InternalServerErrorException,
  NotFoundException,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { CaseSubmissionService } from './casesubmission.service';
import { CreateCaseDto } from './dto/createcase.dto';
import { JwtAuthGuard } from '../auth/auth.guard'; // Import the JwtAuthGuard

@Controller('casesubmissions')
export class CaseSubmissionController {
  jwtService: any;
  constructor(private readonly caseSubmissionService: CaseSubmissionService) {}

  @Post('new')
@UseGuards(JwtAuthGuard)
async createCase(@Body() createCaseDto: CreateCaseDto, @Req() req) {
  console.log('User from token:', req.user); // Debugging

  if (!req.user) {
    throw new UnauthorizedException('User not authenticated');
  }

  try {
    const user = req.user;

    const createdCase = await this.caseSubmissionService.createSubmission({
      ...createCaseDto,
      user_id: user.sub, // Ensure it's `user_id`, NOT `cognito_id`
    });

    return {
      message: 'Case submission created successfully!',
      data: createdCase,
    };
  } catch (error) {
    console.error('❌ Error in createCase:', error);
    throw new InternalServerErrorException(`Error creating case submission: ${error.message}`);
  }
}

  @Get('cases')
  @UseGuards(JwtAuthGuard) // Protect this route with JwtAuthGuard
  async getAllCases() {
    try {
      const cases = await this.caseSubmissionService.getAllCaseSubmissions();

      if (!cases || cases.length === 0) {
        throw new NotFoundException('No cases found.');
      }

      return {
        message: 'Cases retrieved successfully!',
        data: cases,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Error retrieving cases: ${error.message}`);
    }
  }

  @Get('user')
  @UseGuards(JwtAuthGuard) // Protect this route with JwtAuthGuard
  async getUserCases(@Req() req) {
    try {
      const user = req.user; // Extract user information from the token
      const userId = user.sub;

      const userCases = await this.caseSubmissionService.getCasesByUserId(userId);

      if (!userCases || userCases.length === 0) {
        throw new NotFoundException('No cases found for this user.');
      }

      return {
        message: 'User cases retrieved successfully!',
        data: userCases,
      };
    } catch (error) {
      throw new InternalServerErrorException(`Error retrieving user cases: ${error.message}`);
    }
  }
}