/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCaseDto } from '../supabase/dto/createcase.dto';

@Injectable()
export class CaseSubmissionService {
  supabase: any;
  constructor(private readonly supabaseService: SupabaseService) {}

  async createSubmission(caseData: any) {
    try {
      console.log('Received case submission data:', caseData);
  
      const result = await this.supabaseService.getClient()
        .from('case_submissions')
        .insert([caseData]);
  
      if (result.error) {
        console.error('Supabase insert error:', result.error);
        throw new InternalServerErrorException('Failed to insert case submission into database.');
      }
  
      return result.data;
    } catch (error) {
      console.error('Unexpected error in createSubmission:', error);
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
    
  async updateCaseStatus(caseId: string, newStatus: string) {
    try {
      const { data, error } = await this.supabase
        .from('case_submissions')
        .update({ status: newStatus })
        .eq('id', caseId)
        .select();
  
      if (error) {
        console.error('❌ Supabase error (updateCaseStatus):', error);
        throw new InternalServerErrorException(`Supabase error: ${error.message}`);
      }
  
      return data?.[0] || null;
    } catch (error) {
      console.error('❌ Unexpected error in updateCaseStatus:', error);
      throw new InternalServerErrorException('Error updating case status.');
    }
  }
}
