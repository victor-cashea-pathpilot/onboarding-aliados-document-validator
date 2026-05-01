import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobDispatcher, JobRepository } from '@infrastructure';
import type { JobRecord } from '@domain';
import { JOB_DISPATCHER, JOB_REPOSITORY } from './grpc.tokens';

function utcNow(): string {
  return new Date().toISOString();
}

type DocumentReference = {
  url: string;
  document_id?: string | null;
};

type DocumentsPayload = {
  rif: DocumentReference[];
  cedula: DocumentReference[];
  certificado_emprendimiento: DocumentReference[];
  acta_constitutiva: DocumentReference[];
  acta_mercantil: DocumentReference[];
};

export type SubmitValidationRequestMessage = {
  merchant_id: string;
  request_id?: string;
  documents: DocumentsPayload;
  metadata?: Record<string, string>;
};

export type SubmitValidationResponseMessage = {
  job_id: string;
  status: 'PENDING';
  merchant_id: string;
  request_id: string;
  created_at: string;
};

export type StatusRequestMessage = {
  job_ids: string[];
};

export type StatusResponseItemMessage = {
  job_id: string;
  status: string;
  merchant_id: string;
  has_progress: boolean;
  progress: {
    stage: string;
    percentage: number;
    message: string;
  };
  has_overall_result: boolean;
  overall_result: {
    status: string;
    confidence: number;
    summary: string;
    error_codes: string[];
  };
  documents_json: string;
  cross_validation_json: string;
  created_at: string;
  updated_at: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toJsonString(value: unknown): string {
  return value == null ? '' : JSON.stringify(value);
}

@Injectable()
export class GrpcJobsService {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly repository: JobRepository,
    @Inject(JOB_DISPATCHER) private readonly dispatcher: JobDispatcher,
  ) {}

  async submit(
    payload: SubmitValidationRequestMessage,
  ): Promise<SubmitValidationResponseMessage> {
    const createdAt = utcNow();
    const requestId = payload.request_id?.trim() ? payload.request_id.trim() : '';
    const response: SubmitValidationResponseMessage = {
      job_id: `val_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
      status: 'PENDING',
      merchant_id: payload.merchant_id,
      request_id: requestId,
      created_at: createdAt,
    };

    const record: JobRecord = {
      jobId: response.job_id,
      merchantId: payload.merchant_id,
      requestId: requestId || null,
      status: 'PENDING',
      pollCount: 0,
      request: JSON.parse(
        JSON.stringify({
          merchant_id: payload.merchant_id,
          request_id: requestId || null,
          metadata: payload.metadata ?? {},
          documents: payload.documents,
        }),
      ) as Record<string, unknown>,
      createdAt,
      updatedAt: createdAt,
    };

    await this.repository.save(record);
    await this.dispatcher.dispatch(record);
    return response;
  }

  async getStatus(payload: StatusRequestMessage): Promise<StatusResponseItemMessage[]> {
    const results: StatusResponseItemMessage[] = [];

    for (const jobId of payload.job_ids) {
      const record = await this.repository.get(jobId);
      if (!record) {
        results.push({
          job_id: jobId,
          status: 'PENDING',
          merchant_id: '',
          has_progress: false,
          progress: {
            stage: '',
            percentage: 0,
            message: '',
          },
          has_overall_result: false,
          overall_result: {
            status: '',
            confidence: 0,
            summary: '',
            error_codes: [],
          },
          documents_json: '',
          cross_validation_json: '',
          created_at: utcNow(),
          updated_at: utcNow(),
        });
        continue;
      }

      const overallResult = asObject(record.overallResult);
      const progress = record.progress ?? null;
      results.push({
        job_id: record.jobId,
        status: record.status,
        merchant_id: record.merchantId ?? '',
        has_progress: Boolean(progress),
        progress: {
          stage: progress?.stage ?? '',
          percentage: progress?.percentage ?? 0,
          message: progress?.message ?? '',
        },
        has_overall_result: Boolean(overallResult),
        overall_result: {
          status: asString(overallResult?.status) ?? '',
          confidence:
            typeof overallResult?.confidence === 'number' ? overallResult.confidence : 0,
          summary: asString(overallResult?.summary) ?? '',
          error_codes: Array.isArray(overallResult?.errorCodes)
            ? overallResult.errorCodes.filter(
                (value): value is string => typeof value === 'string',
              )
            : Array.isArray(overallResult?.error_codes)
              ? overallResult.error_codes.filter(
                  (value): value is string => typeof value === 'string',
                )
              : [],
        },
        documents_json: toJsonString(record.documents),
        cross_validation_json: toJsonString(record.crossValidation),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      });
    }

    return results;
  }
}
