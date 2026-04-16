import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobDispatcher, JobRepository } from '@infrastructure';
import { sanitizeUrl } from '@infrastructure';
import type { JobRecord } from '@domain';
import { JOB_DISPATCHER, JOB_REPOSITORY } from './api.tokens';
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

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
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
    const normalizedQuery = (query ?? '').trim().toLowerCase();
    const { records: recentRecords } = await this.repository.listPage(1, 500);
    const filtered = normalizedQuery
      ? recentRecords.filter((record) => this.matchesQuery(record, normalizedQuery))
      : recentRecords;
    const start = Math.max(page - 1, 0) * pageSize;
    const end = start + pageSize;
    const pagedRecords = filtered.slice(start, end);

    const items = pagedRecords.map((record) => ({
      job_id: record.jobId,
      merchant_id: record.merchantId,
      request_id: record.requestId ?? null,
      status: record.status,
      overall_status: this.extractOverallStatus(record),
      overall_summary: this.extractOverallSummary(record),
      legal_mode: this.extractLegalMode(record),
      stage: record.progress?.stage ?? null,
      progress_percentage: record.progress?.percentage ?? null,
      progress_message: record.progress?.message ?? null,
      document_count: this.getDocumentCount(record),
      duration_seconds: this.getDurationSeconds(record),
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    }));

    return {
      page,
      page_size: pageSize,
      has_next: end < filtered.length,
      query: query ?? null,
      total_items: filtered.length,
      stats: this.buildStats(recentRecords),
      items,
    };
  }

  private matchesQuery(record: JobRecord, query: string): boolean {
    const haystack = [
      record.jobId,
      record.merchantId,
      record.requestId ?? '',
      record.status,
      this.extractLegalMode(record) ?? '',
      this.extractOverallStatus(record) ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  }

  private extractOverallStatus(record: JobRecord): string | null {
    const overall = asObject(record.overallResult);
    return asString(overall?.status);
  }

  private extractOverallSummary(record: JobRecord): string | null {
    const overall = asObject(record.overallResult);
    return asString(overall?.summary);
  }

  private extractLegalMode(record: JobRecord): string | null {
    const crossValidation = asObject(record.crossValidation);
    const crossValidationMode =
      asString(crossValidation?.legal_mode) ?? asString(crossValidation?.legalMode);
    if (crossValidationMode) {
      return crossValidationMode;
    }

    const normalizedSnapshot = asObject(record.normalizedSnapshot);
    return (
      asString(normalizedSnapshot?.legal_mode) ??
      asString(normalizedSnapshot?.legalMode) ??
      null
    );
  }

  private getDocumentCount(record: JobRecord): number {
    const request = asObject(record.request);
    const documents = asObject(request?.documents);
    const safeBucket = (key: string) => {
      const bucket = documents?.[key];
      return Array.isArray(bucket) ? bucket.length : 0;
    };
    return (
      safeBucket('rif') +
      safeBucket('cedula') +
      safeBucket('certificado_emprendimiento') +
      safeBucket('acta_constitutiva') +
      safeBucket('acta_mercantil')
    );
  }

  private getDurationSeconds(record: JobRecord): number | null {
    if (record.status !== 'COMPLETED' && record.status !== 'FAILED') {
      return null;
    }
    return (new Date(record.updatedAt).getTime() - new Date(record.createdAt).getTime()) / 1000;
  }

  private buildStats(records: JobRecord[]): Record<string, unknown> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const last24h = records.filter((record) => new Date(record.createdAt).getTime() >= cutoff);
    const durations = last24h
      .map((record) => this.getDurationSeconds(record))
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right);

    return {
      cases_last_24h: last24h.length,
      p50_duration_seconds: this.percentile(durations, 0.5),
      p90_duration_seconds: this.percentile(durations, 0.9),
      outcome_counts: {
        approved: last24h.filter((record) => this.extractOverallStatus(record) === 'APPROVED')
          .length,
        rejected: last24h.filter((record) => this.extractOverallStatus(record) === 'REJECTED')
          .length,
        requires_review: last24h.filter(
          (record) => this.extractOverallStatus(record) === 'REQUIRES_REVIEW',
        ).length,
      },
    };
  }

  private percentile(values: number[], percentile: number): number | null {
    if (values.length === 0) {
      return null;
    }
    if (values.length === 1) {
      return values[0];
    }
    const index = Math.round((values.length - 1) * percentile);
    return values[index] ?? null;
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
