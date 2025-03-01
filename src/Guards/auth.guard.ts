/* eslint-disable prettier/prettier */
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Response } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse<Response>();

        
       
        const idToken = request.cookies?.['idToken'];
        const refreshToken = request.cookies?.['refreshToken'];

        if(!idToken || !refreshToken ){
            throw new UnauthorizedException('You need to be login to access this content')
        }

        const verifier = CognitoJwtVerifier.create({
            userPoolId: process.env.COGNITO_USER_POOL_ID,
            tokenUse: "id", 
            clientId: process.env.COGNITO_CLIENT_ID,
        });

        try {
            const payload = await verifier.verify(idToken);
            request.user = payload;
            return true;
        } catch (error) {
            
            if (error.name === 'JwtExpiredError' || 
                error.message.includes('expired') || 
                error.message.includes('Token expired')) {
                try {
                    const tokens = await this.refreshTokens(refreshToken);
                    
                    if (!tokens?.id_token) {
                        throw new UnauthorizedException('Invalid refresh token');
                    }

                    const payload = await verifier.verify(tokens.id_token);
                    request.user = payload;
                    
                   
                    this.setAuthCookies(response, tokens.id_token, refreshToken);
                    
                    return true;
                } catch (refreshError:any) {
                    console.error('Error refreshing tokens:', refreshError);
                    throw new UnauthorizedException('Token refresh failed');
                }
            }

            throw new UnauthorizedException('Invalid token');
        }
    }

    private async refreshTokens(refreshToken: string): Promise<{ id_token?: string, access_token?: string } | null> {
        try {
            const credentials = Buffer.from(`${process.env.COGNITO_CLIENT_ID}:${process.env.COGNITO_CLIENT_SECRET}`).toString('base64');
            const response = await fetch(`${process.env.COGNITO_DOMAIN}/oauth2/token`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`,

                 },
               
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: process.env.COGNITO_CLIENT_ID,
                    refresh_token: refreshToken,
                }),
            });


            if (!response.ok) {
                throw new Error('Token refresh failed');
            }

            const data = await response.json();

            if (data.id_token) {
                return {
                    id_token: data.id_token,
                    access_token: data.access_token
                };
            }

            return null;
        } catch (error) {
            console.error('Error refreshing tokens:', error);
            return null;
        }
    }

    private setAuthCookies(response: Response, idToken: string, refreshToken: string): void {
        response.cookie('idToken', idToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            path: '/',
            maxAge: 60 * 60 * 1000
        });
        
       
        if (refreshToken) {
            response.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                path: '/', 
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
        }
    }
}