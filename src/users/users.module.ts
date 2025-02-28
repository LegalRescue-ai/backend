/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UsersController } from './users.controller';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads', // Ensure this folder exists
    }),
  ],
  controllers: [UsersController],
})
export class UsersModule {}

