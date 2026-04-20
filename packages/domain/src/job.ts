import type { CanonicalMerchantSnapshot } from './canonical';

export interface DomainProgressState {
  stage: string;
  percentage: number;
  message: string;
}

export interface JobRecord {
  jobId: string;
  merchantId: string;
  requestId?: string | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  pollCount: number;
  request: Record<string, unknown>;
  progress?: DomainProgressState | null;
  overallResult?: Record<string, unknown> | null;
  documents?: Record<string, unknown> | null;
  normalizedSnapshot?: CanonicalMerchantSnapshot | null;
  crossValidation?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
