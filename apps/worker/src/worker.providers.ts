import type { Provider } from '@nestjs/common';
import { FirestoreJobRepository, createLogger, getInfrastructureSettings } from '@infrastructure';
import { JobsService } from './jobs.service';
import { JOB_REPOSITORY, WORKER_AUTH_TOKEN } from './worker.tokens';

export const workerProviders: Provider[] = [
  {
    provide: JOB_REPOSITORY,
    useFactory: () => new FirestoreJobRepository(),
  },
  {
    provide: WORKER_AUTH_TOKEN,
    useFactory: () => getInfrastructureSettings().workerAuthToken ?? null,
  },
  {
    provide: 'WORKER_LOGGER',
    useFactory: () => createLogger('TypeScriptWorker'),
  },
  JobsService,
];
