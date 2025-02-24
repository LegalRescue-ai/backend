/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ForgotPasswordModule } from './forgotpassword/forgotpassword.module';
import { MailerModule } from './mailer/mailer.module';
import { DiscountService } from './discount/discount.service';
import { AttorneyAuthModule } from './attorney-auth/attorney-auth.module';
import { SupabaseService } from './supabase/supabase.service';
import { DiscountController } from './discount/discount.controller';
import { DiscountModule } from './discount/discount.module';
import { StripeModule } from './stripe/stripe.module';
import { PaymentModule } from './payment/payment.module';
import { CognitoModule } from './cognito/cognito.module';
import { IdpAuthModule } from './Idp/idp-auth.module';
import { AdminModule } from './admin/admin.module';
import { SupabaseModule } from './supabase/supabase.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    IdpAuthModule,
    MailerModule,
    DiscountModule,
    AttorneyAuthModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DiscountModule,
    StripeModule,
    PaymentModule,
    CognitoModule,
    AdminModule,
    SupabaseModule,
  ],
  providers: [DiscountService, SupabaseService],
  controllers: [DiscountController],
})
export class AppModule {}
