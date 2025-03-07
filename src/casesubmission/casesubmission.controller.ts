/* eslint-disable prettier/prettier */
import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  InternalServerErrorException,
  NotFoundException,
  UseGuards,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { CaseSubmissionService } from './casesubmission.service';
import { JwtAuthGuard } from '../jwt/auth.guard';
import { CreateCaseDto } from '../supabase/dto/createcase.dto'; // Import DTO for validation

@Controller('casesubmissions')
export class CaseSubmissionController {
  constructor(private readonly caseSubmissionService: CaseSubmissionService) {}

  /**
   * Create a new case submission
   */
  @Post('new')
  @UseGuards(JwtAuthGuard) // Ensure only authenticated users can submit
  async createCase(@Body() caseData: CreateCaseDto, @Req() req) {
    console.log('Extracted user from token:', req.user); // Debugging

    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }

    try {
      // Automatically set user_id and submitted_at before sending to the service
      const submissionData = {
        ...caseData,
        user_id: req.user.sub,
        submitted_at: new Date().toISOString(), // Ensure submitted_at is included in request body
      };

      const createdCase = await this.caseSubmissionService.createSubmission(submissionData);

      return {
        message: 'Case submitted successfully!',
        data: createdCase,
      };
    } catch (error) {
      console.error('❌ Error in createCase:', error);
      throw new InternalServerErrorException('Error creating case submission.');
    }
  }

  /**  
   * Retrieve all case submissions (Admin Only)
   */
  @Get('cases')
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
      console.error('❌ Error retrieving cases:', error);
      throw new InternalServerErrorException('Error retrieving case submissions.');
    }
  }

  /**
   * Retrieve cases submitted by the authenticated user
   */
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
      console.error('❌ Error retrieving user cases:', error);
      throw new InternalServerErrorException('Error retrieving user cases.');
    }
  }

  /**
   * Update the status of a case submission
   */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard) // Protect route
  async updateCaseStatus(@Param('id') caseId: string, @Body('status') newStatus: string) {
    if (!newStatus) {
      throw new BadRequestException('Status is required');
    }

    try {
      const updatedCase = await this.caseSubmissionService.updateCaseStatus(caseId, newStatus);

      return {
        message: 'Case status updated successfully!',
        data: updatedCase,
      };
    } catch (error) {
      console.error('❌ Error updating case status:', error);
      throw new InternalServerErrorException('Error updating case status.');
    }
  }
}
