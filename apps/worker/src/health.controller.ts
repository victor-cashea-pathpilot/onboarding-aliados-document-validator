import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      service: 'worker',
      status: 'ok',
      phase: 'typescript-migration-scaffold',
    };
  }
}
