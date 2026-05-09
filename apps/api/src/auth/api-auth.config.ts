export type ApiAuthMode = 'disabled' | 'google_oidc';

export interface ApiAuthSettings {
  mode: ApiAuthMode;
  configuredAudiences: string[];
  staticBearerToken: string | null;
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseAuthMode(value: string | null): ApiAuthMode | null {
  if (value === null) {
    return null;
  }

  if (value === 'disabled' || value === 'google_oidc') {
    return value;
  }

  throw new Error(`Unsupported API_AUTH_MODE: ${value}`);
}

function defaultAuthMode(): ApiAuthMode {
  const environment = readEnv('ENVIRONMENT') ?? readEnv('NODE_ENV') ?? 'local';
  const normalized = environment.toLowerCase();

  if (
    normalized === 'local' ||
    normalized === 'development' ||
    normalized === 'dev' ||
    normalized === 'test'
  ) {
    return 'disabled';
  }

  return 'google_oidc';
}

function parseAudiences(): string[] {
  const combined = [
    readEnv('API_AUTH_AUDIENCE'),
    readEnv('API_AUTH_AUDIENCES'),
  ].filter((value): value is string => value !== null);

  return Array.from(
    new Set(
      combined
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

export function getApiAuthSettings(): ApiAuthSettings {
  return {
    mode: parseAuthMode(readEnv('API_AUTH_MODE')) ?? defaultAuthMode(),
    configuredAudiences: parseAudiences(),
    staticBearerToken: readEnv('API_KEY'),
  };
}
