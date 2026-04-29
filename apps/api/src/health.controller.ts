import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './auth/public.decorator';

@Controller('health')
export class HealthController {
  @SkipThrottle()
  @Public()
  @Get()
  getHealth() {
    return {
      service: 'api',
      status: 'ok',
      phase: 'typescript-migration-api',
    };
  }
}
