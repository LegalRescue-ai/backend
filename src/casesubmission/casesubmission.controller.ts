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
import { CreateCaseDto } from '../supabase/dto/createcase.dto'; 

@Controller('casesubmissions')
export class CaseSubmissionController {
  constructor(private readonly caseSubmissionService: CaseSubmissionService) {}

  
  @Post('new')
  @UseGuards(JwtAuthGuard) 
  async createCase(@Body() caseData: CreateCaseDto, @Req() req) {
    console.log('Extracted user from token:', req.user); 

    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }

    try {
     
      const submissionData = {
        ...caseData,
        user_id: req.user.sub,
        submitted_at: new Date().toISOString(), 
      };

      const createdCase = await this.caseSubmissionService.createSubmission(submissionData);

      return {
        message: 'Case submitted successfully!',
        data: createdCase,
      };
    } catch (error) {
      console.error('Error in createCase:', error);
      throw new InternalServerErrorException('Error creating case submission.');
    }
  }

  @Get('cases')
  async getAllCases() {
    try {
      const cases = await this.caseSubmissionService.getAllCaseSubmissions();

      if (!cases || cases.length === 0) {
        throw new NotFoundException('No cases found.');
      }

      return {
        message: 'Cases retrieved successfully!',
        count: cases.length, 
        data: cases,
      };
    } catch (error) {
      console.error('Error retrieving cases:', error);
      throw new InternalServerErrorException('Error retrieving case submissions.');
    }
  }

  @Get('user')
  @UseGuards(JwtAuthGuard) 
  async getUserCases(@Req() req) {
    try {
      const userId = req.user?.sub; 

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

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard) 
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
      console.error('Error updating case status:', error);
      throw new InternalServerErrorException('Error updating case status.');
    }
  }
}
