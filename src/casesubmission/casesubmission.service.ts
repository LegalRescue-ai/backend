/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { CreateCaseDto } from './dto/createcase.dto';

@Injectable()
export class CaseSubmissionService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async createSubmission(createCaseDto: CreateCaseDto) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('case_submissions')
        .insert([createCaseDto])
        .select();

      if (error) {
        throw new InternalServerErrorException(`Supabase error: ${error.message}`);
      }

      return data;
    } catch (error) {
      throw new InternalServerErrorException('Error creating case submission.');
    }
  }

  async getAllCaseSubmissions() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('case_submissions')
      .select('*');

    if (error) {
      throw new InternalServerErrorException('Error retrieving case submissions.');
    }

    return data;
  }

  async getCasesByUserId(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('case_submissions')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException('Error retrieving user cases.');
    }

    return data;
  }
}
