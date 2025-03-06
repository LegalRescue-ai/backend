/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MailerModule } from './mailer/mailer.module';
import { DiscountService } from './discount/discount.service';
import { AttorneyAuthModule } from './attorney-auth/attorney-auth.module';
import { SupabaseService } from './supabase/supabase.service';
import { DiscountController } from './discount/discount.controller';
import { DiscountModule } from './discount/discount.module';
import { AdminModule } from './admin/admin.module';
import { SupabaseModule } from './supabase/supabase.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    MailerModule,
    DiscountModule,
    AttorneyAuthModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DiscountModule,
    AdminModule,
    SupabaseModule,
  ],
  providers: [DiscountService, SupabaseService],
  controllers: [DiscountController],
})
export class AppModule {}
