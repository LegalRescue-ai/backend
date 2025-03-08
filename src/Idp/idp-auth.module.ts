/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { IdpAuthController } from './idp-auth.controller';
import { IdpConfigService } from './idp-config.service';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../supabase/supabase.module'; 

@Module({
  imports: [ConfigModule, SupabaseModule], 
  controllers: [IdpAuthController],
  providers: [IdpConfigService],
})
export class IdpAuthModule {}
