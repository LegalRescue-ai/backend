/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Module({
  providers: [SupabaseService],
  exports: [SupabaseService], // 👈 Export it for other modules
})
export class SupabaseModule {}
