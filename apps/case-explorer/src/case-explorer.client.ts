import { GoogleAuth } from 'google-auth-library';
import { Injectable } from '@nestjs/common';
import type {
  CaseExplorerRequestView,
  CaseExplorerListItem,
  CaseExplorerListResponse,
  CaseExplorerResponse,
} from '@contracts';
import { getCaseExplorerApiAudience, getCaseExplorerApiUrl } from './case-explorer.config';

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function mapListItem(raw: Record<string, unknown>): CaseExplorerListItem {
  return {
    jobId: asString(raw.job_id) ?? '',
    merchantId: asString(raw.merchant_id) ?? '',
    requestId: asString(raw.request_id),
    status: (asString(raw.status) as CaseExplorerListItem['status']) ?? 'PENDING',
    overallStatus:
      (asString(raw.overall_status) as CaseExplorerListItem['overallStatus']) ?? null,
    overallSummary: asString(raw.overall_summary),
    legalMode: (asString(raw.legal_mode) as CaseExplorerListItem['legalMode']) ?? null,
    stage: asString(raw.stage),
    progressPercentage: asNumber(raw.progress_percentage),
    progressMessage: asString(raw.progress_message),
    documentCount: asNumber(raw.document_count) ?? 0,
    durationSeconds: asNumber(raw.duration_seconds),
    createdAt: asString(raw.created_at) ?? '',
    updatedAt: asString(raw.updated_at) ?? '',
  };
}

function mapListResponse(raw: unknown): CaseExplorerListResponse {
  const payload = asObject(raw) ?? {};
  const stats = asObject(payload.stats) ?? {};
  const outcomeCounts = asObject(stats.outcome_counts) ?? {};
  const items = Array.isArray(payload.items) ? payload.items : [];

  return {
    page: asNumber(payload.page) ?? 1,
    pageSize: asNumber(payload.page_size) ?? 20,
    hasNext: Boolean(payload.has_next),
    query: asString(payload.query),
    totalItems: asNumber(payload.total_items) ?? items.length,
    stats: {
      casesLast24h: asNumber(stats.cases_last_24h) ?? 0,
      p50DurationSeconds: asNumber(stats.p50_duration_seconds),
      p90DurationSeconds: asNumber(stats.p90_duration_seconds),
      outcomeCounts: {
        approved: asNumber(outcomeCounts.approved) ?? 0,
        rejected: asNumber(outcomeCounts.rejected) ?? 0,
        requiresReview: asNumber(outcomeCounts.requires_review) ?? 0,
      },
    },
    items: items.map((item) => mapListItem(asObject(item) ?? {})),
  };
}

function mapCaseResponse(raw: unknown): CaseExplorerResponse {
  const payload = asObject(raw) ?? {};
  const request = (asObject(payload.request) ?? {}) as unknown as CaseExplorerRequestView;
  return {
    jobId: asString(payload.job_id) ?? '',
    merchantId: asString(payload.merchant_id) ?? '',
    requestId: asString(payload.request_id),
    status: (asString(payload.status) as CaseExplorerResponse['status']) ?? 'PENDING',
    request,
    progress: (asObject(payload.progress) ?? null) as CaseExplorerResponse['progress'],
    overallResult: (asObject(payload.overall_result) ?? null) as CaseExplorerResponse['overallResult'],
    documents: (asObject(payload.documents) ?? null) as CaseExplorerResponse['documents'],
    normalizedSnapshot: asObject(payload.normalized_snapshot),
    crossValidation: (asObject(payload.cross_validation) ?? null) as CaseExplorerResponse['crossValidation'],
    createdAt: asString(payload.created_at) ?? '',
    updatedAt: asString(payload.updated_at) ?? '',
  };
}

@Injectable()
export class CaseExplorerClient {
  private readonly auth = new GoogleAuth();
  private readonly apiUrl = getCaseExplorerApiUrl();
  private readonly audience = getCaseExplorerApiAudience();

  private async authHeaders(): Promise<Record<string, string>> {
    const client = await this.auth.getIdTokenClient(this.audience);
    const headers = await client.getRequestHeaders();
    const authorization =
      headers instanceof Headers
        ? headers.get('authorization')
        : ((headers as Record<string, string>).Authorization ??
            (headers as Record<string, string>).authorization ??
            '');
    return {
      Authorization: String(authorization ?? ''),
    };
  }

  async listJobs(query?: string): Promise<CaseExplorerListResponse> {
    const headers = await this.authHeaders();
    const url = new URL('/internal/jobs', this.apiUrl);
    if (query) {
      url.searchParams.set('q', query);
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to load jobs: ${response.status}`);
    }
    return mapListResponse(await response.json());
  }

  async getJob(jobId: string): Promise<CaseExplorerResponse> {
    const headers = await this.authHeaders();
    const url = new URL(`/internal/jobs/${jobId}`, this.apiUrl);
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to load job ${jobId}: ${response.status}`);
    }
    return mapCaseResponse(await response.json());
  }
}
