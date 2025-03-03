/* eslint-disable prettier/prettier */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateCaseDto } from './dto/createcase.dto';
import { SupabaseService } from './supabase.service';

@Injectable()
export class CaseSubmissionService {
  [x: string]: any;
  constructor(private readonly supabaseService: SupabaseService) {}

  async createCaseSubmission(createCaseDto: CreateCaseDto, cognitoId?: string) {
    try {
      // Pass data without requiring Cognito ID
      return await this.supabaseService.createSubmission(createCaseDto, cognitoId);
    } catch (error) {
      console.error('❌ Error in createCaseSubmission:', error); // Log error
      throw new InternalServerErrorException(`Case submission failed: ${error.message}`);
    }
  }

  async getAllCaseSubmissions() {
    try {
      const supabase = this.supabaseService.getClient();
      const { data, error } = await supabase
        .from('case_submissions') // Ensure this table exists
        .select('*');

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
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
