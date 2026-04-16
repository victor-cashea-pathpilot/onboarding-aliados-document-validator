import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHome() {
    return {
      service: 'case-explorer',
      status: 'ok',
      phase: 'typescript-migration-scaffold',
    };
  }
}
