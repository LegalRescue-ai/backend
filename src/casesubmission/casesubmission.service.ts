/* eslint-disable prettier/prettier */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateCaseDto } from './dto/createcase.dto';
import { SupabaseService } from './supabase.service';

@Injectable()
export class CaseSubmissionService {
  constructor(private readonly supabaseService: SupabaseService) {}

  // Modify the method to accept userId as an argument
  async createCaseSubmission(createCaseDto: CreateCaseDto, userId: string) {
    try {
      // Pass the userId to the Supabase service method
      return await this.supabaseService.createSubmission(createCaseDto, userId);
    } catch (error) {
      throw new InternalServerErrorException(`Error in CaseSubmissionService: ${error.message}`);
    }
  }

  async getAllCaseSubmissions() {
    try {
      return await this.supabaseService.getAllSubmissions();
    } catch (error) {
      throw new InternalServerErrorException(`Error in CaseSubmissionService: ${error.message}`);
    }
  }


  async getCasesByUserId(userId: string) {
    try {
      // Filter the cases for the specific user
      const cases = await this.supabaseService.getCasesByUser(userId);
      return cases;
    } catch (error) {
      throw new InternalServerErrorException(`Error fetching user cases: ${error.message}`);
    }
  }
}
