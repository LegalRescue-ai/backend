/* eslint-disable prettier/prettier */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { CreateCaseDto } from './dto/createcase.dto';

@Injectable()
export class SupabaseService {
  private readonly supabase;
  private readonly tableName = 'case_submissions'; // Ensure your Supabase table is named correctly

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new InternalServerErrorException(
        'Supabase environment variables not configured properly.',
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Create a new case submission in Supabase
   */
  async createSubmission(createCaseDto: CreateCaseDto, userId: string) {
    const submission = {
      user_id: userId, // Link submission to logged-in user
      ...createCaseDto, // Spread DTO fields into the object
      submittedAt: new Date().toISOString(), // Add timestamp
    };

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert([submission])
      .select();

    if (error) {
      throw new InternalServerErrorException(`Supabase error: ${error.message}`);
    }

    return data[0]; // Return inserted case submission
  }

  /**
   * Retrieve all case submissions from Supabase
   */
  async getAllSubmissions() {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*');

    if (error) {
      throw new InternalServerErrorException(`Supabase error: ${error.message}`);
    }

    return data;
  }

  /**
   * Retrieve cases by a specific user from Supabase
   */
  async getCasesByUser(userId: string) {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(`Supabase error: ${error.message}`);
    }

    return data;
  }

  /**
   * Retrieve submissions linked to a Cognito user (fix for missing method)
   */
  async getUserSubmissions(userSub: string) {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('cognito_id', userSub); // Ensure your Supabase table has a "cognito_id" field

    if (error) {
      throw new InternalServerErrorException(`Supabase error: ${error.message}`);
    }

    return data;
  }
  async createUser(user: { id: string; email: string; name?: string }) {
    const { data, error } = await this.supabase
      .from('users') // Ensure your table is named 'users'
      .insert([user])
      .select();
  
    if (error) {
      throw new InternalServerErrorException(`Supabase error: ${error.message}`);
    }
  
    return data[0];
  }
}
