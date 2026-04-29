import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

@Injectable()
export class GoogleIdTokenVerifier {
  private readonly client = new OAuth2Client();

  async verify(idToken: string, audiences: string[]): Promise<TokenPayload> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Identity token payload is missing.');
      }

      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid identity token.', {
        cause: error,
      });
    }
  }
}
