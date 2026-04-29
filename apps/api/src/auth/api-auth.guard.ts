import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getApiAuthSettings } from './api-auth.config';
import { GoogleIdTokenVerifier } from './google-id-token-verifier';
import { IS_PUBLIC_KEY } from './public.decorator';

type AuthenticatedRequest = Request & {
  auth?: {
    principal: string;
    type: 'google_oidc' | 'static_bearer';
  };
};

function extractHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === 'string' ? value : null;
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ', 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim() || null;
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: GoogleIdTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])) {
      return true;
    }

    const settings = getApiAuthSettings();
    if (settings.mode === 'disabled') {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorizationHeader = extractHeaderValue(request.headers.authorization);
    const bearerToken = extractBearerToken(authorizationHeader);

    if (!bearerToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    if (
      settings.staticBearerToken &&
      safeEquals(bearerToken, settings.staticBearerToken)
    ) {
      request.auth = {
        principal: 'static-bearer',
        type: 'static_bearer',
      };
      return true;
    }

    const audiences = this.resolveAudiences(request, settings.configuredAudiences);
    const payload = await this.verifier.verify(bearerToken, audiences);
    request.auth = {
      principal: payload.email ?? payload.sub ?? 'google-identity',
      type: 'google_oidc',
    };
    return true;
  }

  private resolveAudiences(
    request: AuthenticatedRequest,
    configuredAudiences: string[],
  ): string[] {
    const audiences = new Set(configuredAudiences);
    const forwardedProto = extractHeaderValue(request.headers['x-forwarded-proto']);
    const forwardedHost = extractHeaderValue(request.headers['x-forwarded-host']);
    const host = extractHeaderValue(request.headers.host);

    if (forwardedProto && forwardedHost) {
      audiences.add(`${forwardedProto}://${forwardedHost}`);
    }

    if (host) {
      audiences.add(`https://${host}`);
    }

    if (audiences.size === 0) {
      throw new InternalServerErrorException(
        'No API auth audience is configured for token verification.',
      );
    }

    return Array.from(audiences);
  }
}
