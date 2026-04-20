export type LegalMode =
  | 'sociedad_mercantil'
  | 'firma_personal'
  | 'emprendimiento'
  | 'unknown';

export type CrossValidationCheckStatus = 'PASSED' | 'FAILED' | 'SKIPPED';

export type ValidationFindingSource =
  | 'rules'
  | 'llm_cross_validation'
  | 'llm_legal_assessment';

export type ValidationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface CrossValidationCheck {
  code: string;
  status: CrossValidationCheckStatus;
  message: string;
}

export interface CrossValidationFinding {
  source: ValidationFindingSource;
  severity: ValidationSeverity;
  code: string;
  message: string;
  relatedChecks: string[];
}

export interface LLMValidationReview {
  recommendation: 'APPROVED' | 'REJECTED' | 'REQUIRES_REVIEW';
  confidence: number;
  summary: string;
  findings: CrossValidationFinding[];
  prompt?: string | null;
  model?: string | null;
}

export interface CrossValidationResult {
  legalMode?: LegalMode | null;
  checks: CrossValidationCheck[];
  findings: CrossValidationFinding[];
  llmCrossValidation?: LLMValidationReview | null;
  llmLegalAssessment?: LLMValidationReview | null;
}
