/* eslint-disable prettier/prettier */
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CreateCaseDto } from "./dto/createcase.dto";

@Injectable()
export class SupabaseService {
  private readonly supabase: SupabaseClient;
  private readonly tableName = "case_submissions"; // Ensure your Supabase table is named correctly

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
  

  /**
   * Create a new case submission in Supabase
   */
  async createSubmission(createCaseDto: CreateCaseDto, userId: string) {
    try {
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
        throw new InternalServerErrorException(
          `Supabase error (createSubmission): ${error.message}`
        );
      }

      return data?.[0] || null; // Return inserted case submission
    } catch (error) {
      console.error("❌ Error in createSubmission:", error);
      throw new InternalServerErrorException("Error creating case submission.");
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
  

  /**
   * Get Supabase client
   */
  getClient(): SupabaseClient {
    if (!this.supabase) {
      throw new InternalServerErrorException("Supabase client is not initialized.");
    }
    return this.supabase;
  }
}
