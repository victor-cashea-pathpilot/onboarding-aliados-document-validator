import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JobRecord } from '@domain';
import type { JobRepository, LoggerLike } from '@infrastructure';
import { formatUnknownError } from '@infrastructure';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentIntakeService } from './document-intake.service';
import { DocumentNormalizationService } from './document-normalization.service';
import { JOB_REPOSITORY, WORKER_AUTH_TOKEN } from './worker.tokens';

@Injectable()
export class JobsService {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly repository: JobRepository,
    @Inject(WORKER_AUTH_TOKEN) private readonly workerAuthToken: string | null,
    @Inject('WORKER_LOGGER') private readonly logger: LoggerLike,
    private readonly documentIntake: DocumentIntakeService,
    private readonly documentExtraction: DocumentExtractionService,
    private readonly documentNormalization: DocumentNormalizationService,
  ) {}

  async processJob(jobId: string, providedWorkerToken?: string | null) {
    this.assertWorkerToken(providedWorkerToken);

    const record = await this.repository.get(jobId);
    if (!record) {
      throw new NotFoundException(`Job ${jobId} not found.`);
    }

    this.logger.info('worker.job.received', {
      event: 'worker.job.received',
      jobId: record.jobId,
      merchantId: record.merchantId,
      requestId: record.requestId ?? null,
      queueWaitMs: this.getQueueWaitMs(record),
      jobStatus: record.status,
    });

    try {
      const updatedRecord = await this.markInitialProcessingState(record);

      this.logger.info('worker.job.accepted', {
        event: 'worker.job.accepted',
        jobId: updatedRecord.jobId,
        merchantId: updatedRecord.merchantId,
        requestId: updatedRecord.requestId ?? null,
        stage: updatedRecord.progress?.stage ?? null,
        progressPercentage: updatedRecord.progress?.percentage ?? null,
      });

      return {
        job_id: updatedRecord.jobId,
        status: 'accepted',
        message:
          'TypeScript worker accepted the job and updated the initial processing state.',
      };
    } catch (error) {
      this.logger.error('worker.job.failed', {
        event: 'worker.job.failed',
        jobId: record.jobId,
        merchantId: record.merchantId,
        requestId: record.requestId ?? null,
        error: formatUnknownError(error),
      });
      throw error;
    }
  }

  private assertWorkerToken(providedWorkerToken?: string | null) {
    if (this.workerAuthToken && providedWorkerToken !== this.workerAuthToken) {
      throw new ForbiddenException('Invalid worker token.');
    }
  }

  private async markInitialProcessingState(record: JobRecord): Promise<JobRecord> {
    if (record.status === 'PENDING') {
      const intakeRecord: JobRecord = {
        ...record,
        status: 'PROCESSING',
        progress: {
          stage: 'document_intake',
          percentage: 25,
          message: 'Validando acceso y formato de documentos.',
        },
        updatedAt: new Date().toISOString(),
      };
      await this.repository.update(intakeRecord);

      const intakeDocuments = await this.documentIntake.buildDocumentsResult(intakeRecord);
      const extractionPendingRecord: JobRecord = {
        ...intakeRecord,
        progress: {
          stage: 'document_extraction',
          percentage: 65,
          message: 'Extrayendo datos de documentos en paralelo.',
        },
        documents: intakeDocuments,
        updatedAt: new Date().toISOString(),
      };
      await this.repository.update(extractionPendingRecord);

      const extractedDocuments = await this.documentExtraction.extractDocuments(
        intakeDocuments,
        extractionPendingRecord,
      );

      const normalizationRecord: JobRecord = {
        ...extractionPendingRecord,
        progress: {
          stage: 'document_normalization',
          percentage: 80,
          message: 'Normalizando datos extraídos y consolidando snapshot canónico.',
        },
        documents: extractedDocuments,
        updatedAt: new Date().toISOString(),
      };
      await this.repository.update(normalizationRecord);

      const normalizedSnapshot = this.documentNormalization.normalize(
        normalizationRecord.merchantId,
        extractedDocuments,
      );

      const updatedRecord: JobRecord = {
        ...normalizationRecord,
        progress: {
          stage: 'document_normalization',
          percentage: 85,
          message: 'Document normalization completado en worker TypeScript.',
        },
        documents: extractedDocuments,
        normalizedSnapshot,
        updatedAt: new Date().toISOString(),
      };

      return this.repository.update(updatedRecord);
    }

    return record;
  }

  private getQueueWaitMs(record: JobRecord): number {
    return Math.max(
      Math.round(new Date().getTime() - new Date(record.createdAt).getTime()),
      0,
    );
  }
}
