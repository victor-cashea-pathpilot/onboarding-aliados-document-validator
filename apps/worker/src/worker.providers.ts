import type { Provider } from '@nestjs/common';
import {
  FirestoreJobRepository,
  VertexGeminiClient,
  createLogger,
  getInfrastructureSettings,
} from '@infrastructure';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentIntakeService } from './document-intake.service';
import { DocumentNormalizationService } from './document-normalization.service';
import { CrossValidationService } from './cross-validation.service';
import { CrossValidationLlmService } from './cross-validation-llm.service';
import { JobsService } from './jobs.service';
import { LegalAssessmentLlmService } from './legal-assessment-llm.service';
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
  DocumentNormalizationService,
  CrossValidationService,
  {
    provide: CrossValidationLlmService,
    useFactory: (geminiClient: VertexGeminiClient, logger: ReturnType<typeof createLogger>) =>
      new CrossValidationLlmService(geminiClient, logger),
    inject: [VertexGeminiClient, 'WORKER_LOGGER'],
  },
  {
    provide: LegalAssessmentLlmService,
    useFactory: (geminiClient: VertexGeminiClient, logger: ReturnType<typeof createLogger>) =>
      new LegalAssessmentLlmService(geminiClient, logger),
    inject: [VertexGeminiClient, 'WORKER_LOGGER'],
  },
  JobsService,
];
