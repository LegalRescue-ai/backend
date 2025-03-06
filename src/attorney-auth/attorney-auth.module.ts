/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AttorneyAuthService } from './attorney-auth.service';
import { AttorneyAuthController } from './attorney-auth.controller';
import { SupabaseService } from 'src/supabase/supabase.service';
import { DiscountService } from 'src/discount/discount.service';
import { CognitoModule } from 'src/cognito/cognito.module';

@Module({
  imports: [CognitoModule],
  providers: [AttorneyAuthService, SupabaseService, DiscountService],
  controllers: [AttorneyAuthController],
})
export class AttorneyAuthModule {}
