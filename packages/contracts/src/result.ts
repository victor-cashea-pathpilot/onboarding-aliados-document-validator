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

export interface ConfidenceBreakdown {
  /** Confidence score from the LLM legal assessment model (0–100). */
  llm_assessment: number;
  /**
   * Average document legibility score across all extracted documents (0–100).
   * Null when no documents reported quality (e.g. mock mode or legacy cases).
   */
  document_quality: number | null;
  /**
   * Composite score: llm_assessment × (document_quality / 100), expressed as 0–100.
   * Null when document_quality is unavailable (composite equals llm_assessment in that case).
   */
  composite: number | null;
}

export interface OverallResult {
  status: DocumentDecisionStatus;
  confidence: number;
  summary: string;
  errorCodes: string[];
  /** Breakdown of how confidence was computed. Present for all cases processed after this feature was deployed. */
  confidenceBreakdown?: ConfidenceBreakdown;
}
