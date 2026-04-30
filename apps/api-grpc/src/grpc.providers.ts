import { Provider } from '@nestjs/common';
import {
  CloudTasksJobDispatcher,
  FirestoreJobRepository,
} from '@infrastructure';
import { GrpcJobsService } from './grpc-jobs.service';
import { JOB_DISPATCHER, JOB_REPOSITORY } from './grpc.tokens';

export const grpcProviders: Provider[] = [
  {
    provide: JOB_REPOSITORY,
    useFactory: () => new FirestoreJobRepository(),
  },
  {
    provide: JOB_DISPATCHER,
    useFactory: () => new CloudTasksJobDispatcher(),
  },
  GrpcJobsService,
];
