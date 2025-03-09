/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { CognitoService } from './cognito.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseModule } from '../supabase/supabase.module';
 
@Module({
  imports: [ConfigModule, SupabaseModule], 
  providers: [
    {
      provide: 'COGNITO_CONFIG',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        userPoolId: configService.get<string>('COGNITO_USER_POOL_ID'),
        clientId: configService.get<string>('COGNITO_CLIENT_ID'),
        clientSecret: configService.get<string>('COGNITO_CLIENT_SECRET'),
        awsRegion: configService.get<string>('REGION'),
      }),
    },
    {
      provide: 'SUPABASE_CONFIG',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        url: configService.get<string>('SUPABASE_URL'),
        key: configService.get<string>('SUPABASE_SECRET_KEY'),
      }),
    },
    CognitoService,
  ],
  exports: [CognitoService, 'COGNITO_CONFIG', 'SUPABASE_CONFIG'], 
})
export class CognitoModule {}
