/* eslint-disable prettier/prettier */
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import * as jwkToPem from 'jwk-to-pem'; 
import axios from 'axios';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwksUrl: string;

  constructor() {
    if (!process.env.REGION || !process.env.COGNITO_USER_POOL_ID) {
      throw new Error('AWS_REGION or COGNITO_USER_POOL_ID is not set.');
    }
    this.jwksUrl = `https://cognito-idp.${process.env.REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: Request = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed authorization header');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decodedToken = jwt.decode(token, { complete: true });
      if (!decodedToken) {
        throw new UnauthorizedException('Invalid token');
      }

      const kid = decodedToken.header.kid;
      const { data } = await axios.get(this.jwksUrl);
      const key = data.keys.find((k) => k.kid === kid);

      if (!key) {
        throw new UnauthorizedException('Invalid JWT key');
      }

      const pem = jwkToPem(key);
      jwt.verify(token, pem, { algorithms: ['RS256'] });

      req.user = decodedToken.payload;
      return true;
    } catch (error) {
      console.error('JWT Verification Error:', error.message);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
