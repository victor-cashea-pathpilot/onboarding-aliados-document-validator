import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JobRecord } from '@domain';
import type { JobRepository, LoggerLike } from '@infrastructure';
import { formatUnknownError } from '@infrastructure';
import { JOB_REPOSITORY, WORKER_AUTH_TOKEN } from './worker.tokens';

@Injectable()
export class JobsService {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly repository: JobRepository,
    @Inject(WORKER_AUTH_TOKEN) private readonly workerAuthToken: string | null,
    @Inject('WORKER_LOGGER') private readonly logger: LoggerLike,
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
      const updatedRecord: JobRecord = {
        ...record,
        status: 'PROCESSING',
        progress: {
          stage: 'document_intake',
          percentage: 10,
          message: 'TypeScript worker accepted the job and is preparing intake.',
        },
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
