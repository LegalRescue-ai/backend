/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as cookieParser from 'cookie-parser'; // ✅ Import cookie-parser
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ✅ Middleware: Use cookie-parser
  app.use(cookieParser());

  // ✅ Serve Static Assets
  app.useStaticAssets(path.join(__dirname, '..', 'uploads'), {
    prefix: '/uploads', // Now files are served from /uploads/filename
  });

  // ✅ Enable CORS
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://tonnel-test-client.d34j9mhleth3x6.amplifyapp.com',
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ✅ Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
      validationError: { target: false, value: false },
    }),
  );

  const PORT = process.env.PORT ?? 3002;
  await app.listen(PORT);
  console.log(`🚀 Server is running on port ${PORT}`);
}

bootstrap();
