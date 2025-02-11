/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Body, Request, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CaseSubmissionService } from './casesubmission.service';
import { CreateCaseDto } from './dto/createcase.dto';

@Controller('casesubmissions')
export class CaseSubmissionController {
  constructor(private readonly caseSubmissionService: CaseSubmissionService) {}

  @Post('new') 
  async createCase(@Body() createCaseDto: CreateCaseDto, @Request() req) {
    try {
      if (!req.user || !req.user.userId) {
        throw new UnauthorizedException('Invalid or missing user authentication.');
      }

      const userId = req.user.userId;  // Extracted from JWT payload
      const createdCase = await this.caseSubmissionService.createCaseSubmission(createCaseDto, userId);

      if (!createdCase) {
        throw new InternalServerErrorException('Failed to create case submission.');
      }

      return {
        message: 'Case submission created successfully!',
        data: createdCase,
      };
    } catch (error) {
      throw new InternalServerErrorException(`Error creating case submission: ${error.message}`);
    }
  }

  @Get()
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
      throw new InternalServerErrorException(`Error retrieving cases: ${error.message}`);
    }
  }

  @Get('user')
  async getUserCases(@Request() req) {
    try {
      if (!req.user || !req.user.userId) {
        throw new UnauthorizedException('Invalid or missing user authentication.');
      }

      const userId = req.user.userId;

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
