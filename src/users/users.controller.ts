/* eslint-disable prettier/prettier */
import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('users')
export class UsersController {
  @Post('upload-profile-picture')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads', // Ensure this directory exists
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, uniqueSuffix + extname(file.originalname));
        },
      }),
    }),
  )
  uploadProfilePicture(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('File upload failed');
    }
    return { imageUrl: `http://localhost:3000/uploads/${file.filename}` };
  }
}
