/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  async saveProfilePicture(filePath: string): Promise<string> {
    // Placeholder function - extend this to save the path to a database
    return filePath;
  }
}
