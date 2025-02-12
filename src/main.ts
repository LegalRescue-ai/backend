/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-require-imports */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv'; 
dotenv.config();

async function bootstrap() {
const app = await NestFactory.create(AppModule);
const cors = require('cors');
app.use(cors({ 
  origin:
   'http://localhost:3000', 
   'https://tonnel-test-client.d34j9mhleth3x6.amplifyapp.com/signupChoice'
   }));
  app.useGlobalPipes(new ValidationPipe({
    whitelist:true,
    transform:true,
    forbidNonWhitelisted:true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    validationError: {
      target: false,
      value: false,
    },
  }))
  await app.listen(process.env.PORT ?? 3001);
  console.log(`Server is running on port ${process.env.PORT ?? 3001}`);

}
bootstrap();
