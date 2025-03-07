/* eslint-disable prettier/prettier */
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CreateCaseDto } from "./dto/createcase.dto";

@Injectable()
export class SupabaseService {
  getSupabaseUrl() {
    throw new Error('Method not implemented.');
  }
  private readonly supabase: SupabaseClient;
  private readonly tableName = "case_submissions"; // Ensure your Supabase table is named correctly
  logger: any;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new InternalServerErrorException(
        "Supabase environment variables not configured properly."
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Create a new case submission in Supabase
   * 
   */
  
  async createSubmission(createCaseDto: CreateCaseDto, userId: string) {
    try {
      const submission = {
        ...createCaseDto,
        user_id: userId,
        submitted_at: new Date().toISOString(),
        status: createCaseDto.status || "Case Submitted", // ✅ Default status if not provided
      };
  
      const { data, error } = await this.supabase
        .from('case_submissions')
        .insert([submission])
        .select();
  
      if (error) {
        console.error('❌ Supabase error (createSubmission):', error);
        throw new InternalServerErrorException(`Supabase error: ${error.message}`);
      }
  
      return data?.[0] || null;
    } catch (error) {
      console.error('❌ Unexpected error in createSubmission:', error);
      throw new InternalServerErrorException('Error creating case submission.');
    }
  } 

  
  /**
   * Retrieve all case submissions from Supabase
   */
  async getAllSubmissions() {
    try {
      const { data, error } = await this.supabase.from(this.tableName).select("*");

      if (error) {
        throw new InternalServerErrorException(
          `Supabase error (getAllSubmissions): ${error.message}`
        );
      }

      return data;
    } catch (error) {
      console.error("❌ Error in getAllSubmissions:", error);
      throw new InternalServerErrorException("Error retrieving case submissions.");
    }
  }

  /**
   * Retrieve cases by a specific user from Supabase
   */
  async getCasesByUser(userId: string) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
        .eq("user_id", userId);

      if (error) {
        throw new InternalServerErrorException(
          `Supabase error (getCasesByUser): ${error.message}`
        );
      }

      return data;
    } catch (error) {
      console.error("❌ Error in getCasesByUser:", error);
      throw new InternalServerErrorException("Error retrieving user cases.");
    }
  }

  async upsertUser(email: string, cognitoSub: string) {
    try {
      const { data, error } = await this.supabase
        .from('users') // Ensure this is the correct table name
        .upsert(
          {
            email: email,
            cognito_id: cognitoSub, // Store the Cognito Sub (ID)
            confirmed: true, // Mark as confirmed since they logged in
            updated_at: new Date().toISOString(), // Update timestamp
          },
          { onConflict: 'cognito_sub' } // Use a string instead of an array
        );
  
      if (error) {
        this.logger.error('Error upserting user in Supabase:', error);
        throw new InternalServerErrorException('Failed to save user in Supabase');
      }
  
      return data;
    } catch (error) {
      this.logger.error('Unexpected error in upsertUser:', error);
      throw new InternalServerErrorException('Unexpected error saving user');
    }
  }

  
  /**
   * Retrieve submissions linked to a Cognito user
   */
  async getSubmissionsByCognitoId(cognitoId: string) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
        .eq("cognito_id", cognitoId); // Ensure your Supabase table has a "cognito_id" field

      if (error) {
        throw new InternalServerErrorException(
          `Supabase error (getSubmissionsByCognitoId): ${error.message}`
        );
      }

      return data;
    } catch (error) {
      console.error("❌ Error in getSubmissionsByCognitoId:", error);
      throw new InternalServerErrorException("Error retrieving user submissions.");
    }
  }

  /**
   * Create a new user in Supabase
   */
  async createUser(user: { id: string; email: string; name?: string }) {
    try {
      const { data, error } = await this.supabase
        .from("users") // Ensure your table is named 'users'
        .insert([user])
        .select();

      if (error) {
        throw new InternalServerErrorException(
          `Supabase error (createUser): ${error.message}`
        );
      }

      return data?.[0] || null;
    } catch (error) {
      console.error("❌ Error in createUser:", error);
      throw new InternalServerErrorException("Error creating user.");
    }
  }


  async getUserByCognitoId(cognitoId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('cognito_id', cognitoId)
      .single();

    if (error) {
      throw new InternalServerErrorException('Error fetching user from Supabase');
    }

    return data;
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }
  
}
