import { Body, Controller, Post } from '@nestjs/common';

@Controller('internal')
export class JobsController {
  @Post('process-job')
  processJob(@Body() body: Record<string, unknown>) {
    return {
      accepted: true,
      phase: 'typescript-migration-scaffold',
      body,
    };
  }
}
