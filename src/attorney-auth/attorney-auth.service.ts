/* eslint-disable prettier/prettier */
import {  PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

import { DiscountService } from 'src/discount/discount.service';
import { StripeService } from 'src/stripe/stripe.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { AttorneySignUpDTO } from 'src/attorney-auth/dto/attorney_signUp_dto';
import { UpdateAttorneyDto } from 'src/attorney-auth/dto/attorney_Update_dto copy';


const TABLES = {
  WAITLIST: 'waitlist',
  ATTORNEY_USERS: 'attorneys',
} as const;

@Injectable()
export class AttorneyAuthService {
  private readonly logger = new Logger(AttorneyAuthService.name);
  private readonly supabaseClient: SupabaseClient;
  private s3: S3Client;
  private bucketName = process.env.S3_BUCKET_NAME;


  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly discountService: DiscountService,
    private readonly stripeService: StripeService,

  ) {
    this.supabaseClient = supabaseService.getClient();
   
      this.s3 = new S3Client({
        region: process.env.REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
    }



  async signUpAttorney(data: AttorneySignUpDTO) {
    const { email } = data;

    const existingAttorney = await this.findAttorneyByEmail(email);
    if (existingAttorney) {
      this.logger.warn('Attorney with this email already exists', { email });
      throw new ConflictException('An attorney with this email already exists');
    }

    try {
      const newUser = await this.createAttorneyUser(data);
      return newUser;
    } catch (error) {
      this.logger.error(`SignUp process failed: ${error.message}`, {
        error,
        email,
      });
      throw error;
    }
  }

  async registerAttorneySubscription(
    email: string,
    id: string,
    normalPrice: number,
    statesLicensing: { barLicenseNumber: string }[],
  ) {
    const waitlistUsers = await this.checkWaitlistStatus(email);
    const subscriptionData = await this.createSubscription(
      email,
      id,
      normalPrice,
      statesLicensing,
      waitlistUsers,
    );


    return subscriptionData;
  }

 

  async getAttorneyData(email: string) {
    try {
 
      const attorney = await this.findAttorneyByEmail(email);

      if (!attorney) {
        throw new NotFoundException('Attorney user not found');
      }

      const { data: subscription, error: subscriptionError } = await this.supabaseClient
        .from('attorney_subscriptions')
        .select('*')
        .eq('attorneyId', attorney.id)
        .single();

      if (subscriptionError && subscriptionError.code !== 'PGRST116') { 
        throw subscriptionError;
      }

     
      return {
        ...attorney,
        subscription: subscription || null
      };
    } catch (error) {
      throw error;
    }
  }

  async updateAttorneyDetails(email: string, data: UpdateAttorneyDto) {
    try {
     
      const attorney = await this.findAttorneyByEmail(email);
      if (!attorney) {
        throw new NotFoundException('Attorney user not found');
      }

      
      const updatedUser = await this.updateAttorneyUser(email, data);
      return updatedUser;
    } catch (error) {
      this.logger.error(`Update process failed: ${error.message}`, {
        email,
        data,
      });
      throw error;
    }
  }

  async uploadImage(file: Express.Multer.File, attorneyId: string, email: string) {
    const attorney = await this.findAttorneyByEmail(email)
    if(!attorney){
      throw new NotFoundException('Attorney with the email was not found')
    }
    const fileName = `profile-images/${attorneyId}.jpg`; 
    const params = {
      Bucket: this.bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      
    };
  
    await this.s3.send(new PutObjectCommand(params));
    const url = `https://${this.bucketName}.s3.amazonaws.com/${fileName}`
    const data = {profile_picture_url: url }

    await this.updateAttorneyDetails(email, data)
  
    return {
      imageUrl: url,
      fileName,
    };
  }
  
  

  async deleteAttorney(email: string): Promise<string> {
    try {
      const attorney = await this.findAttorneyByEmail(email);
      if (!attorney) {
        throw new NotFoundException('Attorney user not found');
      }

      await this.deleteAttorneyUser(email);
      return 'Attorney user deleted successfully';
    } catch (error) {
      this.logger.error(`Delete process failed: ${error.message}`, { email });
      throw error;
    }
  }

  async findAttorneyByEmail(email: string) {
    const { data, error } = await this.supabaseClient
      .from(TABLES.ATTORNEY_USERS)
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to check attorney existence: ${error.message}`);
    }

    return data;
  }

  private async createAttorneyUser(data: AttorneySignUpDTO) {
    const { data: newUser, error } = await this.supabaseClient
      .from(TABLES.ATTORNEY_USERS)
      .insert([data])
      .select('*')
      .single();

    if (error) {
      this.logger.error(`Error creating new user: ${error.message}`, { data });
      throw new Error(`Failed to create attorney user: ${error.message}`);
    }

    return newUser;
  }

  private async updateAttorneyUser(email: string, data: UpdateAttorneyDto) {
    const { data: updatedUser, error } = await this.supabaseClient
      .from(TABLES.ATTORNEY_USERS)
      .update(data)
      .eq('email', email)
      .select('*')
      .single();

    if (error) {
      this.logger.error(`Error updating attorney: ${error.message}`, {
        email,
        data,
      });
      throw new Error(`Failed to update attorney: ${error.message}`);
    }

    return updatedUser;
  }

  private async checkWaitlistStatus(email: string) {
    const { data, error } = await this.supabaseClient
      .from(TABLES.WAITLIST)
      .select('*')
      .eq('email', email);

    if (error) {
      this.logger.error(
        `Error retrieving user from waitlist: ${error.message}`,
        { email },
      );
      throw new Error(`Failed to check waitlist status: ${error.message}`);
    }

    return data;
  }

  private async deleteAttorneyUser(email: string) {
    const { error } = await this.supabaseClient
      .from(TABLES.ATTORNEY_USERS)
      .delete()
      .eq('email', email);

    if (error) {
      this.logger.error(`Error deleting attorney: ${error.message}`, { email });
      throw new Error(`Failed to delete attorney: ${error.message}`);
    }
  }


  private async createSubscription(
    email: string,
    attorneyId: string,
    normalPrice: number,
    statesLicensing: Array<{ barLicenseNumber: string }>,
    waitlistUsers: any[],
  ) {
    let attorneyTier = null;

    if (waitlistUsers.length > 0) {
      const licenses = statesLicensing.map(
        (license) => license.barLicenseNumber,
      );
      attorneyTier = await this.discountService.getAttorneyTier(
        email,
        licenses,
      );

      if (!attorneyTier) {
        this.logger.error('License mismatch with waitlist', {
          email,
          licenses,
        });
        throw new Error(
          'The licenses do not match the details on the waitlist',
        );
      }
    }

    const session = await this.stripeService.createCheckoutSession(
      normalPrice,
      attorneyTier,
      email,
      attorneyId,
    );

    return { newUser: attorneyId, url: session.url };
  }
}
