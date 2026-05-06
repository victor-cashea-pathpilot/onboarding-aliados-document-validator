export interface InfrastructureSettings {
  environment: string;
  logLevel: string;
  mockMode: boolean;
  gcpProjectId?: string;
  firestoreDatabase: string;
  firestoreCollection: string;
  downloadTimeoutSeconds: number;
  maxDocumentSizeBytes: number;
  maxExtractionConcurrency: number;
  gcpRegion?: string;
  cloudTasksQueueId?: string;
  cloudTasksServiceAccountEmail?: string;
  workerBaseUrl?: string;
  workerAudience?: string;
  workerAuthToken?: string;
  geminiLocation: string;
  geminiModelSimple: string;
  geminiModelComplex: string;
  enableLlmCrossValidation: boolean;
  enableLlmLegalAssessment: boolean;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getInfrastructureSettings(): InfrastructureSettings {
  return {
    environment: process.env.ENVIRONMENT ?? 'development',
    logLevel: process.env.LOG_LEVEL ?? 'INFO',
    mockMode: process.env.MOCK_MODE === 'true',
    gcpProjectId: process.env.GCP_PROJECT_ID ?? undefined,
    firestoreDatabase: process.env.FIRESTORE_DATABASE ?? '(default)',
    firestoreCollection: process.env.FIRESTORE_COLLECTION ?? 'validation_jobs',
    downloadTimeoutSeconds: Number(process.env.DOWNLOAD_TIMEOUT_SECONDS ?? '20'),
    maxDocumentSizeBytes: Number(process.env.MAX_DOCUMENT_SIZE_BYTES ?? `${15 * 1024 * 1024}`),
    maxExtractionConcurrency: Number(process.env.MAX_EXTRACTION_CONCURRENCY ?? '4'),
    gcpRegion: process.env.GCP_REGION ?? undefined,
    cloudTasksQueueId: process.env.CLOUD_TASKS_QUEUE_ID ?? undefined,
    cloudTasksServiceAccountEmail:
      process.env.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL ?? undefined,
    workerBaseUrl: process.env.WORKER_BASE_URL ?? undefined,
    workerAudience: process.env.WORKER_AUDIENCE ?? undefined,
    workerAuthToken: process.env.WORKER_AUTH_TOKEN?.trim() ?? undefined,
    geminiLocation: process.env.GEMINI_LOCATION ?? 'global',
    geminiModelSimple: process.env.GEMINI_MODEL_SIMPLE ?? 'gemini-2.5-flash',
    geminiModelComplex: process.env.GEMINI_MODEL_COMPLEX ?? 'gemini-2.5-pro',
    enableLlmCrossValidation: process.env.ENABLE_LLM_CROSS_VALIDATION !== 'false',
    enableLlmLegalAssessment: process.env.ENABLE_LLM_LEGAL_ASSESSMENT !== 'false',
  };
}

export function requireCloudTasksSettings(
  settings: InfrastructureSettings,
): InfrastructureSettings & {
  gcpProjectId: string;
  gcpRegion: string;
  cloudTasksQueueId: string;
  workerBaseUrl: string;
} {
  return {
    ...settings,
    gcpProjectId: settings.gcpProjectId ?? env('GCP_PROJECT_ID'),
    gcpRegion: settings.gcpRegion ?? env('GCP_REGION'),
    cloudTasksQueueId: settings.cloudTasksQueueId ?? env('CLOUD_TASKS_QUEUE_ID'),
    workerBaseUrl: settings.workerBaseUrl ?? env('WORKER_BASE_URL'),
  };
}
