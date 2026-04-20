import type { CrossValidationResult } from './validation';
import type { DocumentsResult, OverallResult } from './result';
import type {
  CaseExplorerRequestView,
  JobStatus,
  ProgressState,
} from './job';

export interface CaseExplorerResponse {
  jobId: string;
  merchantId: string;
  requestId?: string | null;
  status: JobStatus;
  request: CaseExplorerRequestView;
  progress?: ProgressState | null;
  overallResult?: OverallResult | null;
  documents?: DocumentsResult | null;
  normalizedSnapshot?: Record<string, unknown> | null;
  crossValidation?: CrossValidationResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseExplorerListItem {
  jobId: string;
  merchantId: string;
  requestId?: string | null;
  status: JobStatus;
  overallStatus?: 'APPROVED' | 'REJECTED' | 'REQUIRES_REVIEW' | null;
  overallSummary?: string | null;
  legalMode?: import('./validation').LegalMode | null;
  stage?: string | null;
  progressPercentage?: number | null;
  progressMessage?: string | null;
  documentCount: number;
  durationSeconds?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseExplorerOutcomeCounts {
  approved: number;
  rejected: number;
  requiresReview: number;
}

export interface CaseExplorerListStats {
  casesLast24h: number;
  p50DurationSeconds?: number | null;
  p90DurationSeconds?: number | null;
  outcomeCounts: CaseExplorerOutcomeCounts;
}

export interface CaseExplorerListResponse {
  page: number;
  pageSize: number;
  hasNext: boolean;
  query?: string | null;
  totalItems: number;
  stats: CaseExplorerListStats;
  items: CaseExplorerListItem[];
}
