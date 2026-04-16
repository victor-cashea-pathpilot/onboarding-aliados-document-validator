import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobDispatcher, JobRepository } from '@infrastructure/index';
import { sanitizeUrl } from '@infrastructure/index';
import type { JobRecord } from '@domain/job';
import {
  JOB_DISPATCHER,
  JOB_REPOSITORY,
} from './api.providers';
import type {
  DocumentsPayloadDto,
  StatusRequestDto,
  StatusResponseItemDto,
  SubmitValidationRequestDto,
  SubmitValidationResponseDto,
} from './dto/validation.dto';

function utcNow(): string {
  return new Date().toISOString();
}

function totalDocuments(payload: DocumentsPayloadDto): number {
  return (
    payload.rif.length +
    payload.cedula.length +
    payload.certificado_emprendimiento.length +
    payload.acta_constitutiva.length +
    payload.acta_mercantil.length
  );
}

@Injectable()
export class ApiJobsService {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly repository: JobRepository,
    @Inject(JOB_DISPATCHER) private readonly dispatcher: JobDispatcher,
  ) {}

  async submit(payload: SubmitValidationRequestDto): Promise<SubmitValidationResponseDto> {
    const createdAt = utcNow();
    const response: SubmitValidationResponseDto = {
      job_id: `val_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
      status: 'PENDING',
      merchant_id: payload.merchant_id,
      request_id: payload.request_id ?? null,
      created_at: createdAt,
    };

    const record: JobRecord = {
      jobId: response.job_id,
      merchantId: payload.merchant_id,
      requestId: payload.request_id ?? null,
      status: 'PENDING',
      pollCount: 0,
      request: JSON.parse(JSON.stringify(payload)) as Record<string, unknown>,
      createdAt,
      updatedAt: createdAt,
    };

    await this.repository.save(record);
    await this.dispatcher.dispatch(record);
    return response;
  }

  async getStatus(payload: StatusRequestDto): Promise<StatusResponseItemDto[]> {
    const results: StatusResponseItemDto[] = [];
    for (const jobId of payload.job_ids) {
      const record = await this.repository.get(jobId);
      if (!record) {
        results.push({
          job_id: jobId,
          status: 'PENDING',
          created_at: utcNow(),
          updated_at: utcNow(),
        });
        continue;
      }

      results.push({
        job_id: record.jobId,
        merchant_id: record.merchantId,
        status: record.status,
        progress: record.progress
          ? {
              stage: record.progress.stage,
              percentage: record.progress.percentage,
              message: record.progress.message,
            }
          : null,
        overall_result: record.overallResult ?? null,
        documents: record.documents ?? null,
        cross_validation: record.crossValidation ?? null,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      });
    }
    return results;
  }

  async getCase(jobId: string): Promise<Record<string, unknown> | null> {
    const record = await this.repository.get(jobId);
    if (!record) {
      return null;
    }

    return {
      job_id: record.jobId,
      merchant_id: record.merchantId,
      request_id: record.requestId ?? null,
      status: record.status,
      request: this.sanitizeRequest(record.request),
      progress: record.progress ?? null,
      overall_result: record.overallResult ?? null,
      documents: record.documents ?? null,
      normalized_snapshot: record.normalizedSnapshot ?? null,
      cross_validation: record.crossValidation ?? null,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
  }

  async listCases(
    page = 1,
    pageSize = 20,
    query?: string,
  ): Promise<Record<string, unknown>> {
    const { records, hasNext } = await this.repository.listPage(page, pageSize);
    const filtered = query
      ? records.filter((record) => {
          const normalized = query.trim().toLowerCase();
          const haystack = [
            record.jobId,
            record.merchantId,
            record.requestId ?? '',
            record.status,
            (record.crossValidation as { legalMode?: string } | null)?.legalMode ?? '',
            (record.overallResult as { status?: string } | null)?.status ?? '',
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalized);
        })
      : records;

    const items = filtered.map((record) => ({
      job_id: record.jobId,
      merchant_id: record.merchantId,
      request_id: record.requestId ?? null,
      status: record.status,
      overall_status: (record.overallResult as { status?: string } | null)?.status ?? null,
      overall_summary:
        (record.overallResult as { summary?: string } | null)?.summary ?? null,
      legal_mode:
        (record.crossValidation as { legalMode?: string; legal_mode?: string } | null)
          ?.legal_mode ??
        (record.crossValidation as { legalMode?: string; legal_mode?: string } | null)
          ?.legalMode ??
        null,
      stage: record.progress?.stage ?? null,
      progress_percentage: record.progress?.percentage ?? null,
      progress_message: record.progress?.message ?? null,
      document_count: totalDocuments(record.request.documents as DocumentsPayloadDto),
      duration_seconds:
        record.status === 'COMPLETED' || record.status === 'FAILED'
          ? (new Date(record.updatedAt).getTime() - new Date(record.createdAt).getTime()) /
            1000
          : null,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    }));

    return {
      page,
      page_size: pageSize,
      has_next: hasNext,
      query: query ?? null,
      total_items: filtered.length,
      stats: {
        cases_last_24h: records.length,
        p50_duration_seconds: null,
        p90_duration_seconds: null,
        outcome_counts: {
          approved: 0,
          rejected: 0,
          requires_review: 0,
        },
      },
      items,
    };
  }

  private sanitizeRequest(payload: Record<string, unknown>): Record<string, unknown> {
    const request = payload as {
      merchant_id: string;
      request_id?: string | null;
      metadata?: Record<string, string>;
      documents?: DocumentsPayloadDto;
    };

    const sanitizeBucket = (
      documents: Array<{ url: string; document_id?: string | null }> = [],
    ) =>
      documents.map((document) => ({
        url: sanitizeUrl(document.url) ?? document.url,
        document_id: document.document_id ?? null,
      }));

    return {
      merchant_id: request.merchant_id,
      request_id: request.request_id ?? null,
      metadata: request.metadata ?? {},
      documents: {
        rif: sanitizeBucket(request.documents?.rif),
        cedula: sanitizeBucket(request.documents?.cedula),
        certificado_emprendimiento: sanitizeBucket(
          request.documents?.certificado_emprendimiento,
        ),
        acta_constitutiva: sanitizeBucket(request.documents?.acta_constitutiva),
        acta_mercantil: sanitizeBucket(request.documents?.acta_mercantil),
      },
    };
  }
}
