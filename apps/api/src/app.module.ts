import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { apiProviders } from './api.providers';
import { ApiJobsService } from './api-jobs.service';
import { ApiAuthGuard } from './auth/api-auth.guard';
import { GoogleIdTokenVerifier } from './auth/google-id-token-verifier';
import { HealthController } from './health.controller';
import { getApiHttpSecuritySettings } from './http-security.config';
import { ValidationController } from './validation.controller';

const httpSecuritySettings = getApiHttpSecuritySettings();

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: httpSecuritySettings.throttling.ttlMs,
        limit: httpSecuritySettings.throttling.limit,
      },
    ]),
  ],
  controllers: [HealthController, ValidationController],
  providers: [
    ...apiProviders,
    GoogleIdTokenVerifier,
    {
      provide: APP_GUARD,
      useClass: ApiAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
