import { Module } from '@nestjs/common';
import { apiProviders } from './api.providers';
import { ApiJobsService } from './api-jobs.service';
import { HealthController } from './health.controller';
import { ValidationController } from './validation.controller';

@Module({
  controllers: [HealthController, ValidationController],
  providers: [...apiProviders],
})
export class AppModule {}
