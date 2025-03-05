/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { CaseSubmissionController } from './casesubmission.controller';
import { CaseSubmissionService } from './casesubmission.service';
import { SupabaseService } from './supabase.service';
import { CognitoModule } from 'src/cognito/cognito.module';

@Module({
  imports: [CognitoModule],
  controllers: [CaseSubmissionController],
  providers: [CaseSubmissionService, SupabaseService],
})
export class CaseSubmissionModule {}
