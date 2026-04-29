# API Authentication

## Objective

Document the authentication model for the onboarding API, with emphasis on service-to-service calls from workloads running in GCP.

## Current Authentication Model

The API uses two layers of protection:

1. Cloud Run platform authentication
2. NestJS application-level authentication guard

In deployed environments, the API is expected to run as a private Cloud Run service using `--no-allow-unauthenticated`.

That means:

- requests must pass Cloud Run IAM before they ever reach the Nest app
- callers should authenticate as a Google service account
- callers should send a Google-signed ID token in the `Authorization` header

## Recommended Pattern

Use service-to-service authentication with a dedicated service account for each calling workload.

Recommended flow:

1. Deploy the API as a private Cloud Run service.
2. Attach a dedicated runtime service account to the calling service.
3. Grant that service account `roles/run.invoker` on the API service.
4. Generate a Google-signed ID token with the API audience.
5. Send `Authorization: Bearer <token>` on every API request.

This is the preferred model for:

- Cloud Run calling Cloud Run
- Cloud Run calling the API from the case explorer
- CI or smoke-test jobs that already run with Google credentials

## Audience Rules

The audience must match one of:

- the API Cloud Run service URL
- a configured Cloud Run custom audience if one is set later

Current repo behavior:

- `apps/case-explorer/src/case-explorer.client.ts` requests an ID token using `GoogleAuth().getIdTokenClient(audience)`
- `infra/gcp/smoke_test.sh` requests an ID token using `gcloud auth print-identity-token --audiences="${API_URL}"`
- `apps/api/src/auth/api-auth.guard.ts` verifies bearer tokens against configured audiences and forwarded request host information

## Application Guard

The Nest app now has a global auth guard.

Files:

- `apps/api/src/app.module.ts`
- `apps/api/src/auth/api-auth.guard.ts`
- `apps/api/src/auth/google-id-token-verifier.ts`
- `apps/api/src/auth/api-auth.config.ts`

Behavior:

- business endpoints require a bearer token
- valid Google OIDC tokens are accepted
- `GET /health` bypasses the Nest guard through `@Public()`

Important caveat:

- `@Public()` does not bypass Cloud Run IAM
- if the Cloud Run service is private, `/health` still requires a valid authenticated request at the platform edge

## Protected Endpoints

- `POST /v1/onboarding/validate`
- `POST /v1/onboarding/status`
- `GET /internal/jobs/:jobId`
- `GET /internal/jobs`

## Public Endpoint

- `GET /health` at the Nest layer only

## Environment Settings

Relevant environment variables:

- `API_AUTH_MODE`
  - `google_oidc` in deployed environments
  - defaults to `disabled` in local, development, and test environments
- `API_AUTH_AUDIENCE`
  - optional single explicit audience
- `API_AUTH_AUDIENCES`
  - optional comma-separated explicit audiences
- `API_STATIC_BEARER_TOKEN`
  - optional fallback for non-Google callers

Current deployment default:

- `infra/gcp/deploy_api.sh` sets `API_AUTH_MODE="${API_AUTH_MODE:-google_oidc}"`

## Local Development

Current local behavior is intentionally relaxed:

- if `ENVIRONMENT` or `NODE_ENV` is `local`, `development`, `dev`, or `test`, the app auth mode defaults to `disabled`
- this allows local development without forcing Google token generation

If you want to test auth locally:

1. set `API_AUTH_MODE=google_oidc`
2. set `API_AUTH_AUDIENCE` to the expected audience
3. call the API with a valid Google-signed ID token

For quick local fallback testing, `API_STATIC_BEARER_TOKEN` can also be set manually.

## Calling from Another GCP Service

For another GCP service that calls the API:

1. create or choose a dedicated service account for the caller
2. grant that service account `roles/run.invoker` on the API service
3. configure the caller with:
   - `API_URL`
   - `API_AUDIENCE`
4. use `google-auth-library` to obtain an ID token for `API_AUDIENCE`
5. call the API with that token

Example in Node.js:

```ts
import { GoogleAuth } from 'google-auth-library';

const apiUrl = process.env.API_URL!;
const audience = process.env.API_AUDIENCE!;

const auth = new GoogleAuth();
const client = await auth.getIdTokenClient(audience);
const headers = await client.getRequestHeaders();

const response = await fetch(`${apiUrl}/v1/onboarding/status`, {
  method: 'POST',
  headers: {
    ...headers,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    job_ids: ['job-123'],
  }),
});
```

## Case Explorer

The case explorer already follows the intended model.

Current behavior:

- `apps/case-explorer/src/case-explorer.client.ts` gets an ID token client from Google ADC
- it calls the API with the resulting `Authorization` header
- `infra/gcp/deploy_case_explorer.sh` grants the case explorer runtime service account `roles/run.invoker` on the API

## Smoke Test

The smoke test now follows the same model.

Current behavior:

- `infra/gcp/smoke_test.sh` obtains an audience-bound identity token
- it uses that token for `/health`, `/v1/onboarding/validate`, and `/v1/onboarding/status`

## Fallback Option

The code currently supports `API_STATIC_BEARER_TOKEN`.

This should be treated as a fallback, not the primary model.

Use it only if:

- a caller cannot use Google service account identity
- the integration is temporary
- the token is stored in Secret Manager, not in source control

## Operational Checklist

Before a new service calls the API:

1. confirm the API is deployed privately
2. identify the caller runtime service account
3. grant `roles/run.invoker` on the API to that service account
4. set `API_URL` and `API_AUDIENCE` in the caller service config
5. verify the caller sends a Google ID token
6. run a smoke request to `/v1/onboarding/status`

## Related Files

- `apps/api/src/auth/api-auth.config.ts`
- `apps/api/src/auth/api-auth.guard.ts`
- `apps/api/src/auth/google-id-token-verifier.ts`
- `apps/api/src/health.controller.ts`
- `apps/case-explorer/src/case-explorer.client.ts`
- `infra/gcp/deploy_api.sh`
- `infra/gcp/deploy_case_explorer.sh`
- `infra/gcp/smoke_test.sh`
- `docs/Security_Remediation_Plan_v1.md`
