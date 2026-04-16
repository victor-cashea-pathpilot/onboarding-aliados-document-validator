import { Provider } from '@nestjs/common';
import {
  CloudTasksJobDispatcher,
  FirestoreJobRepository,
} from '@infrastructure/index';
import { ApiJobsService } from './api-jobs.service';

export const JOB_REPOSITORY = Symbol('JOB_REPOSITORY');
export const JOB_DISPATCHER = Symbol('JOB_DISPATCHER');

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
