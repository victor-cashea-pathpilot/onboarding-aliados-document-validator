import { Module } from '@nestjs/common';
import { CaseExplorerController } from './case-explorer.controller';
import { CaseExplorerClient } from './case-explorer.client';
import { CaseExplorerService } from './case-explorer.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, CaseExplorerController],
  providers: [CaseExplorerClient, CaseExplorerService],
})
export class AppModule {}
