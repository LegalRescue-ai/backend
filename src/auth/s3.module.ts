/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [
    {
      provide: S3Client,
      useFactory: (configService: ConfigService) => {
        return new S3Client({
          region: configService.get<string>('REGION'),
          credentials: {
            accessKeyId: configService.get<string>('T_AWS_ACCESS_KEY_ID'),
            secretAccessKey: configService.get<string>('T_AWS_SECRET_ACCESS_KEY'),
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [S3Client], // Export S3Client so other modules can use it
})
export class S3Module {}
