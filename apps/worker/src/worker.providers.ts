import type { Provider } from '@nestjs/common';
import {
  FirestoreJobRepository,
  VertexGeminiClient,
  createLogger,
  getInfrastructureSettings,
} from '@infrastructure';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentIntakeService } from './document-intake.service';
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
  {
    provide: VertexGeminiClient,
    useFactory: () => new VertexGeminiClient(),
  },
  {
    provide: DocumentIntakeService,
    useFactory: () => new DocumentIntakeService(),
  },
  {
    provide: DocumentExtractionService,
    useFactory: (geminiClient: VertexGeminiClient) =>
      new DocumentExtractionService(undefined, geminiClient),
    inject: [VertexGeminiClient],
  },
  JobsService,
];
