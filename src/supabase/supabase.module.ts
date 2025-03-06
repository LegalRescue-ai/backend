/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Module({
  providers: [
    SupabaseService,
    {
      provide: SupabaseClient,
      useFactory: () => {
        return createClient(
          process.env.SUPABASE_URL as string,
          process.env.SUPABASE_SECRET_KEY as string
        );
      },
    },
  ],
  exports: [SupabaseService, SupabaseClient], // ✅ Export SupabaseClient
})
export class SupabaseModule {}
