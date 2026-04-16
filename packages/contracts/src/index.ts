export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type JobStage =
  | 'document_intake'
  | 'document_extraction'
  | 'document_normalization'
  | 'cross_validation'
  | 'completed';

export type DocumentType =
  | 'rif'
  | 'cedula'
  | 'acta_constitutiva'
  | 'acta_mercantil'
  | 'certificado_emprendimiento';

export interface ProgressState {
  stage: JobStage;
  percentage: number;
  message: string;
}
