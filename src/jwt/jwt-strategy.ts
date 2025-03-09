/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CognitoService } from '../cognito/cognito.service';
import { AuthService } from '../auth/auth.service';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly cognitoService: CognitoService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: async (req, rawJwtToken, done) => {
        try {
          const publicKey = await cognitoService.getPublicKey();
          done(null, publicKey);
        } catch (error) {
          done(error, null);
        }
      },
    });
  }


  async validate(payload: JwtPayload) {
    try {
      const user = await this.authService.getUserInfo(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Invalid token or user not found.');
      }
      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid token or user not found.');
    }
  }
}