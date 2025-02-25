/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { ValidationPipe } from '@nestjs/common';
import * as session from 'express-session';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    rawBody: true,
  });

  app.use(
    '/api/v1/payments/webhook',
    express.raw({ type: 'application/json' }),
  );

  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  app.setGlobalPrefix('/api/v1');

  app.enableCors({
    origin: [
      'https://nextjs-boilerplate-five-opal-54.vercel.app',
      'http://localhost:3000',
      'https://www.legalrescue.ai',
      'https://main.d1d7vpftwumgan.amplifyapp.com',
      'https://dev.d1wv5zmnajfzzh.amplifyapp.com',
      'https://attorney-test.dp1dsrlz16brp.amplifyapp.com'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization', 'x-refresh-token'],
    exposedHeaders: ['new-id-token'],
    credentials: true,
  });

 
  await app.listen(3001);
}

bootstrap();
