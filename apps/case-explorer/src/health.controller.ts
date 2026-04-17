import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      service: 'case-explorer',
      status: 'ok',
      phase: 'typescript-migration-case-explorer',
    };
  }
}
