import type { CrossValidationResult } from './validation';
import type { DocumentsPayload, SanitizedDocumentsPayload } from './document';
import type { DocumentsResult, OverallResult } from './result';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type JobStage =
  | 'document_intake'
  | 'document_extraction'
  | 'document_normalization'
  | 'cross_validation'
  | 'completed';

export interface SubmitValidationRequest {
  merchantId: string;
  requestId?: string | null;
  documents: DocumentsPayload;
  metadata: Record<string, string>;
}

export interface CaseExplorerRequestView {
  merchantId: string;
  requestId?: string | null;
  metadata: Record<string, string>;
  documents: SanitizedDocumentsPayload;
}

export interface SubmitValidationResponse {
  jobId: string;
  status: 'PENDING';
  merchantId: string;
  requestId?: string | null;
  createdAt: string;
}

export interface StatusRequest {
  jobIds: string[];
}

export interface ProgressState {
  stage: JobStage | string;
  percentage: number;
  message: string;
}

export interface StatusResponseItem {
  jobId: string;
  status: JobStatus;
  merchantId?: string | null;
  progress?: ProgressState | null;
  overallResult?: OverallResult | null;
  documents?: DocumentsResult | null;
  crossValidation?: CrossValidationResult | null;
  createdAt: string;
  updatedAt: string;
}
