/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Module({
  providers: [SupabaseService],
  exports: [SupabaseService], // ✅ Export the service
})
export class SupabaseModule {}
