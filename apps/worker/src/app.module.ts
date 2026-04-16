import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { JobsController } from './jobs.controller';
import { workerProviders } from './worker.providers';

@Module({
  controllers: [HealthController, JobsController],
  providers: [...workerProviders],
})
export class AppModule {}
