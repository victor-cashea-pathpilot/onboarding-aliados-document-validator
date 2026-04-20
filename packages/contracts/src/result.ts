export type DocumentDecisionStatus =
  | 'APPROVED'
  | 'REJECTED'
  | 'REQUIRES_REVIEW';

export interface DocumentError {
  errorCode: string;
  message: string;
}

export interface DocumentResultItem {
  documentId?: string | null;
  status: DocumentDecisionStatus;
  confidence: number;
  extractedData: Record<string, unknown>;
  errors: DocumentError[];
}

export interface DocumentsResult {
  rif: DocumentResultItem[];
  cedula: DocumentResultItem[];
  certificadoEmprendimiento: DocumentResultItem[];
  actaConstitutiva: DocumentResultItem[];
  actaMercantil: DocumentResultItem[];
}

export interface OverallResult {
  status: DocumentDecisionStatus;
  confidence: number;
  summary: string;
  errorCodes: string[];
}
