import { Provider } from '@nestjs/common';
import {
  CloudTasksJobDispatcher,
  FirestoreJobRepository,
} from '@infrastructure';
import { ApiJobsService } from './api-jobs.service';
import { JOB_DISPATCHER, JOB_REPOSITORY } from './api.tokens';

export const apiProviders: Provider[] = [
  {
    provide: JOB_REPOSITORY,
    useFactory: () => new FirestoreJobRepository(),
  },
  {
    provide: JOB_DISPATCHER,
    useFactory: () => new CloudTasksJobDispatcher(),
  },
  ApiJobsService,
];
