import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { JobsController } from './jobs.controller';

@Module({
  controllers: [HealthController, JobsController],
})
export class AppModule {}
