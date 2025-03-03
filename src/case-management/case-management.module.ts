/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { CaseManagementService } from './case-management.service';
import { CaseManagementController } from './case-management.controller';
import { SupabaseService } from 'src/supabase/supabase.service';

@Module({
  controllers: [CaseManagementController],
  providers: [CaseManagementService, SupabaseService]
})
export class CaseManagementModule {}
