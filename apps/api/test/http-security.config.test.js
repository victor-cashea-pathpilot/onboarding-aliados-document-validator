const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getApiHttpSecuritySettings,
  isOriginAllowed,
  isSwaggerEnabled,
} = require('../../../dist/apps/api/apps/api/src/http-security.config.js');

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, ORIGINAL_ENV);
}

test.afterEach(() => {
  resetEnv();
});

test('http security config defaults to permissive CORS in local development', () => {
  process.env.ENVIRONMENT = 'local';
  delete process.env.API_CORS_ALLOWED_ORIGINS;

  const settings = getApiHttpSecuritySettings();

  assert.equal(settings.cors.allowAllOrigins, true);
  assert.equal(isOriginAllowed('http://localhost:3001', settings.cors), true);
  assert.equal(isOriginAllowed(undefined, settings.cors), true);
  assert.equal(settings.throttling.limit, 60);
  assert.equal(settings.throttling.ttlMs, 60000);
  assert.equal(settings.bodySizeLimit, '1mb');
});

test('http security config requires explicit browser origins outside local', () => {
  process.env.ENVIRONMENT = 'staging';
  process.env.API_CORS_ALLOWED_ORIGINS =
    'https://console.example.com,https://admin.example.com';

  const settings = getApiHttpSecuritySettings();

  assert.equal(settings.cors.allowAllOrigins, false);
  assert.equal(
    isOriginAllowed('https://console.example.com', settings.cors),
    true,
  );
  assert.equal(
    isOriginAllowed('https://evil.example.com', settings.cors),
    false,
  );
  assert.equal(isOriginAllowed(undefined, settings.cors), true);
});

test('http security config parses throttle and body size overrides', () => {
  process.env.ENVIRONMENT = 'staging';
  process.env.API_RATE_LIMIT_TTL_MS = '120000';
  process.env.API_RATE_LIMIT_LIMIT = '25';
  process.env.API_BODY_SIZE_LIMIT = '256kb';

  const settings = getApiHttpSecuritySettings();

  assert.equal(settings.throttling.ttlMs, 120000);
  assert.equal(settings.throttling.limit, 25);
  assert.equal(settings.bodySizeLimit, '256kb');
});

test('http security config rejects invalid positive integer settings', () => {
  process.env.API_RATE_LIMIT_LIMIT = '0';

  assert.throws(
    () => getApiHttpSecuritySettings(),
    /API_RATE_LIMIT_LIMIT must be a positive integer/,
  );
});

test('swagger is enabled in local environment by default', () => {
  process.env.ENVIRONMENT = 'local';
  delete process.env.SWAGGER_ENABLED;

  assert.equal(isSwaggerEnabled(), true);
});

test('swagger is disabled in staging environment by default', () => {
  process.env.ENVIRONMENT = 'staging';
  delete process.env.SWAGGER_ENABLED;

  assert.equal(isSwaggerEnabled(), false);
});

test('swagger can be force-enabled via SWAGGER_ENABLED=true', () => {
  process.env.ENVIRONMENT = 'staging';
  process.env.SWAGGER_ENABLED = 'true';

  assert.equal(isSwaggerEnabled(), true);
});

test('swagger can be force-disabled via SWAGGER_ENABLED=false in local', () => {
  process.env.ENVIRONMENT = 'local';
  process.env.SWAGGER_ENABLED = 'false';

  assert.equal(isSwaggerEnabled(), false);
});
