export interface ApiCorsSettings {
  allowAllOrigins: boolean;
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAgeSeconds: number;
}

export interface ApiThrottlingSettings {
  ttlMs: number;
  limit: number;
}

export interface ApiHttpSecuritySettings {
  cors: ApiCorsSettings;
  throttling: ApiThrottlingSettings;
  bodySizeLimit: string;
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLocalEnvironment(): boolean {
  const environment = readEnv('ENVIRONMENT') ?? readEnv('NODE_ENV') ?? 'local';
  const normalized = environment.toLowerCase();

  return (
    normalized === 'local' ||
    normalized === 'development' ||
    normalized === 'dev' ||
    normalized === 'test'
  );
}

function parseCsvEnv(name: string, fallback: string[]): string[] {
  const raw = readEnv(name);
  if (!raw) {
    return fallback;
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parsePositiveInteger(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function getApiHttpSecuritySettings(): ApiHttpSecuritySettings {
  const localEnvironment = isLocalEnvironment();
  const corsOrigins = parseCsvEnv(
    'API_CORS_ALLOWED_ORIGINS',
    localEnvironment ? ['*'] : [],
  );
  const allowAllOrigins = corsOrigins.includes('*');

  return {
    cors: {
      allowAllOrigins,
      allowedOrigins: allowAllOrigins
        ? corsOrigins.filter((origin) => origin !== '*')
        : corsOrigins,
      allowedMethods: parseCsvEnv('API_CORS_ALLOWED_METHODS', [
        'GET',
        'POST',
        'OPTIONS',
      ]),
      allowedHeaders: parseCsvEnv('API_CORS_ALLOWED_HEADERS', [
        'Authorization',
        'Content-Type',
        'X-Api-Key',
        'X-Request-Id',
      ]),
      exposedHeaders: parseCsvEnv('API_CORS_EXPOSED_HEADERS', ['X-Request-Id']),
      maxAgeSeconds: parsePositiveInteger('API_CORS_MAX_AGE_SECONDS', 3600),
    },
    throttling: {
      ttlMs: parsePositiveInteger('API_RATE_LIMIT_TTL_MS', 60_000),
      limit: parsePositiveInteger('API_RATE_LIMIT_LIMIT', 60),
    },
    bodySizeLimit: readEnv('API_BODY_SIZE_LIMIT') ?? '1mb',
  };
}

/**
 * Returns true when Swagger should be mounted.
 *
 * Swagger is only enabled in local/development/test environments so that
 * the API schema is never publicly reachable in staging or production.
 * Override with SWAGGER_ENABLED=true|false to change the default.
 */
export function isSwaggerEnabled(): boolean {
  const explicit = readEnv('SWAGGER_ENABLED');
  if (explicit !== null) {
    return explicit.toLowerCase() === 'true';
  }

  return isLocalEnvironment();
}

export function isOriginAllowed(
  origin: string | undefined,
  settings: ApiCorsSettings,
): boolean {
  if (!origin) {
    return true;
  }

  if (settings.allowAllOrigins) {
    return true;
  }

  return settings.allowedOrigins.includes(origin);
}
