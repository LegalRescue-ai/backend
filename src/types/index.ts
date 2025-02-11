/* eslint-disable prettier/prettier */


export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string | null;
  scopes: string[];
}

export interface ApplePrivateKeyConfig {
  teamId: string;
  keyId: string;
  privateKeyPath: string;
  clientId: string;
}
