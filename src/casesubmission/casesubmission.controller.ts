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
import { JwtAuthGuard } from '../auth/auth.guard'; // Import the  

@Controller('casesubmissions')
export class CaseSubmissionController {
  jwtService: any;
  constructor(private readonly caseSubmissionService: CaseSubmissionService) {}

  @Post('new')
  @UseGuards(JwtAuthGuard) // Ensure only authenticated users can submit
  async createCase(@Body() caseData, @Req() req) {
    console.log('Extracted user from token:', req.user); // Debugging
  
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }
  
    // Automatically set user_id from JWT
    caseData.user_id = req.user.sub;
  
    try {
      return await this.caseSubmissionService.createSubmission(caseData);
    } catch (error) {
      console.error('Error in createCase:', error);
      throw new InternalServerErrorException('Error creating case submission.');
    }
  }  

  @Get('cases') // No authentication required
async getAllCases() {
  try {
    const cases = await this.caseSubmissionService.getAllCaseSubmissions();

    if (!cases || cases.length === 0) {
      throw new NotFoundException('No cases found.');
    }

    return {
      message: 'Cases retrieved successfully!',
      count: cases.length, // Add the count of cases
      data: cases,
    };
  } catch (error) {
    console.error('Error retrieving cases:', error);
    throw new InternalServerErrorException('Error retrieving case submissions.');
  }
}
  
  @Get('user')
@UseGuards(JwtAuthGuard) // Ensure only authenticated users can access
async getUserCases(@Req() req) {
  try {
    const userId = req.user?.sub; // Extract user_id from JWT token

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const userCases = await this.caseSubmissionService.getCasesByUserId(userId);

    if (!userCases || userCases.length === 0) {
      throw new NotFoundException('No cases found for this user.');
    }

    return {
      message: 'User cases retrieved successfully!',
      data: userCases,
    };
  } catch (error) {
    console.error('Error retrieving user cases:', error);
    throw new InternalServerErrorException('Error retrieving user cases.');
  }
}
}
