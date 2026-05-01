# Security Remediation Plan

## Objective

Turn the external security review into an execution plan that fits the current repository, with stages that can be implemented and verified independently.

This plan is adapted to the code that exists today in this repo, not copied 1:1 from the audit PDF. Some audit items do not map directly to the current project shape and must be validated before implementation.

## Current Baseline

Observed in the current repo:

- `apps/api/src/main.ts` already enables a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and `transform`.
- `apps/api/src/main.ts` exposes Swagger unconditionally at `/api/docs`.
- `apps/api/src/main.ts` does not currently configure auth, CORS, Helmet, rate limiting, or a global exception filter.
- `apps/api/src/validation.controller.ts` exposes public onboarding endpoints and internal job listing endpoints.
- `.github/workflows/typescript-ci.yml` already exists and runs build plus test suites.
- Root `.dockerignore` already exists.
- App-level Dockerfiles already exist for `apps/api`, `apps/worker`, and `apps/case-explorer`.
- No database TLS config with `rejectUnauthorized: false` was found in the current codebase, so that audit item must be treated as a verification task unless DB connection code is added later.

## Scope

In scope:

- API access control
- HTTP hardening
- error handling and response sanitization
- Swagger exposure control
- CI and deployment security controls
- TypeScript and configuration hardening
- repository hygiene items that reduce operational risk

Out of scope for the first pass:

- deep application authorization models by merchant role
- secret rotation policy outside repo-managed config
- full platform networking controls in GCP
- replacing the current deployment model unless security requirements force it

## Stage 0: Reconcile the Audit Against the Repo

### Goal

Freeze the real remediation scope before changing code, so the team does not spend time implementing findings that belong to a different codebase shape.

### Status

- completed
- reconciled against the repo on 2026-04-28

### Why this stage exists

The audit PDF references a NestJS microservice template. This repo is also NestJS-based, but several findings do not match the exact current structure. The plan should be driven by verified gaps, not by template assumptions.

### Tasks

- Map each audit finding to a concrete file or confirm it is not applicable.
- Mark these items as "confirmed gap", "already covered", or "needs follow-up":
  - missing root `Dockerfile`
  - missing `.dockerignore`
  - missing CI/CD workflow
  - package naming inconsistency
  - database SSL with `rejectUnauthorized: false`
- Record which endpoints must remain unauthenticated:
  - `GET /health`
  - any future `live` or `ready` endpoints if added
- Record which endpoints must be protected:
  - `POST /v1/onboarding/validate`
  - `POST /v1/onboarding/status`
  - `GET /internal/jobs/:jobId`
  - `GET /internal/jobs`

### Reconciliation Results

| Audit item | Repo status | Notes |
| --- | --- | --- |
| Missing global auth guard | confirmed gap | No auth guard existed in `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, or `apps/api/src/validation.controller.ts` before Stage 1 work. |
| Missing root `Dockerfile` | not applicable for now | This repo deploys app-specific images from `apps/api/Dockerfile`, `apps/worker/Dockerfile`, and `apps/case-explorer/Dockerfile`. |
| Missing `.dockerignore` | already covered | Root `.dockerignore` already exists. |
| Missing CI/CD workflow | already covered | `.github/workflows/typescript-ci.yml` already exists and runs build plus test suites. |
| Missing CORS config | confirmed gap | No explicit CORS configuration is present in `apps/api/src/main.ts`. |
| Missing Helmet | confirmed gap | No `helmet` setup is present in `apps/api/src/main.ts`. |
| Missing rate limiting | confirmed gap | No throttling layer is present in the API app. |
| Missing global exception filter | confirmed gap | No app-wide filter is registered in `apps/api/src/main.ts`. |
| Swagger exposed in production | confirmed gap | Swagger is always enabled at `/api/docs`. |
| `strict: false` and weak TS safety | confirmed gap | `tsconfig.base.json` still has `noImplicitAny: false` and `strictBindCallApply: false`. |
| `rejectUnauthorized: false` in DB SSL | needs follow-up | No matching DB TLS config was found in the current repo. Re-check only if direct DB transport config is introduced later. |
| Missing `CLAUDE.md` | optional / workflow-dependent | Not a runtime security control. Only add if the team uses that workflow. |
| Missing `.claude/rules/` | optional / workflow-dependent | Same as above. Add only with a clear owner and usage model. |
| Missing `CODEOWNERS` | confirmed gap | No repo-level `CODEOWNERS` file exists today. |
| Missing `dependabot.yml` | confirmed gap | No Dependabot config exists today. |
| Package naming inconsistency | not applicable to current repo | Root `package.json` is `ai-legal-doc-validation`; the audit's `bff-template` mismatch does not apply here. |

### Auth Boundary Decision

- App-level public route:
  - `GET /health`
- App-level protected routes:
  - `POST /v1/onboarding/validate`
  - `POST /v1/onboarding/status`
  - `GET /internal/jobs/:jobId`
  - `GET /internal/jobs`
- Platform-level note:
  - In deployed environments where `infra/gcp/deploy_api.sh` uses `--no-allow-unauthenticated`, Cloud Run IAM still requires authentication for every route, including `/health`.
  - The `@Public()` decorator only bypasses the Nest guard inside the container. It does not make a private Cloud Run route publicly reachable.

### Files to inspect or update

- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/validation.controller.ts`
- `.github/workflows/typescript-ci.yml`
- `.dockerignore`
- `apps/api/Dockerfile`
- `apps/worker/Dockerfile`
- `apps/case-explorer/Dockerfile`
- `package.json`
- this document

### Deliverable

A confirmed remediation backlog with incorrect audit assumptions removed or rewritten as verification items.

### Exit Criteria

- Every audit item is mapped to a repo location or explicitly marked as not applicable.
- The team agrees on the auth boundary for public versus protected endpoints.

## Stage 1: Add an Authentication Boundary to the API

### Goal

Remove unauthenticated access to onboarding and internal job endpoints.

### Status

- completed
- implemented at the app layer
- verified against the current Cloud Run deployment model
- documented in `docs/API_Authentication_v1.md`
- one plan assumption corrected: `/health` is public only at the Nest layer, not at the Cloud Run platform layer when the service is private

### Current Gap

The API module exposes business endpoints without any global or route-level guard in `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, or `apps/api/src/validation.controller.ts`.

### Implementation Tasks

- Choose the enforcement model for the API:
  - preferred: Cloud Run IAM or an upstream identity layer plus verification in the API
  - fallback: API key or signed bearer token validation inside the Nest app
- Introduce a dedicated auth module or auth provider layer in `apps/api/src/`.
- Add a guard that protects all business endpoints by default.
- Exempt only the minimal health endpoints from auth.
- Decide whether internal job endpoints remain exposed at all; if not, move them behind the same guard or remove them from external routing.
- Add environment-driven configuration for issuer, audience, trusted keys, or static credentials depending on the selected auth model.
- Update Swagger to describe the auth scheme only after enforcement exists.

### Target Files

- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/validation.controller.ts`
- new files under `apps/api/src/auth/`
- `package.json` if auth dependencies are required

### Verification

- Add API tests for:
  - protected endpoint without credentials returns `401` or `403`
  - protected endpoint with valid credentials succeeds
  - `GET /health` bypasses the Nest auth guard
- Confirm local development has a documented way to provide valid credentials.
- Confirm Cloud Run deployment config can provide the required auth settings.
- Confirm the deployed auth model matches Cloud Run service-to-service guidance:
  - callers send Google-signed ID tokens
  - the token `aud` claim matches the Cloud Run service URL or a configured custom audience
  - private Cloud Run services remain IAM-protected at the platform edge

### Exit Criteria

- All business endpoints are protected.
- Health endpoints are explicitly exempted from the Nest guard and documented with the Cloud Run IAM caveat.
- Tests cover both allowed and denied access paths.
- The authentication model is documented for service-to-service callers.

## Stage 2: Harden the HTTP Surface

### Goal

Reduce common API abuse and browser-facing exposure at the framework level.

### Status

- completed
- explicit CORS policy added
- `helmet` enabled with Swagger-safe settings
- global throttling enabled
- request body size limit added
- `X-Request-Id` response/request propagation added
- verified with build and API test suite

### Current Gap

`apps/api/src/main.ts` currently boots Nest without explicit CORS policy, security headers, or throttling.

### Implementation Tasks

- Add explicit CORS configuration:
  - define allowed origins by environment
  - restrict methods and headers to what the API actually uses
  - avoid wildcard origins in non-local environments
- Add `helmet` with a reviewed configuration that does not break Swagger or Cloud Run behavior.
- Add rate limiting for public API paths:
  - separate baseline limits for onboarding submission and status polling if needed
  - use stricter limits for internal endpoints if they remain exposed
- Review request body size limits if document references or metadata could be abused for oversized requests.
- Add request correlation IDs or structured request logging if needed for rate-limit and auth investigations.

### Target Files

- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `package.json`

### Verification

- Add tests or smoke checks for:
  - disallowed origin blocked in non-local mode
  - security headers present in responses
  - repeated requests trigger throttling
- Validate Swagger and normal API requests still work after `helmet` is enabled.

### Exit Criteria

- CORS is explicit and environment-aware.
- Security headers are enabled.
- Throttling is enforced on the API surface.

## Stage 3: Integrate with Cashea CI/CD and Dev Environment

### Goal

Make the service deployable into Cashea `core-allies-dev` using a repository-local workflow that aligns with the current DevOps shell-first deployment model.

### Status

- in progress
- first dev-only GitHub Actions implementation added
- temporary JSON key auth chosen for speed
- WIF migration remains follow-up work

### Why this stage exists

The service now has working runtime code and GCP resources, but merge-readiness also depends on having a repeatable deployment path into the actual Cashea environment. The DevOps team already has a shell-based Cloud Run deployment pattern; this repo should align with that shape even if the first pass uses GitHub Actions before the platform standard is finalized.

### Implementation Tasks

- Add a repo-local deploy config for the Cashea dev environment:
  - project `core-allies-dev`
  - region `us-east1`
  - Cashea VPC and subnet
  - service names for `ldv-api`, `ldv-grpc`, and `ldv-worker`
- Add a GitHub Actions workflow for manual dev deployment:
  - `workflow_dispatch` only in the first pass
  - deploy targets: `api`, `grpc`, `worker`, `all`
  - temporary service-account JSON key authentication
- Generate Cloud Run env vars from GitHub Environment variables and secrets instead of checked-in YAML.
- Keep the implementation close to the Cashea DevOps deployment pattern:
  - validate config
  - build and push image
  - deploy service
- Document the GitHub Environment contract for:
  - GCP auth secret
  - Firestore settings
  - Cloud Tasks queue
  - worker auth token
  - optional explorer settings for the fast-follow stage
- Leave explorer deployment as a fast follow after the API, gRPC API, and worker path is stable.

### Target Files

- `.github/workflows/`
- `infra/cicd/`
- `docs/`

### Verification

- Confirm the workflow can deploy each selected target independently in `core-allies-dev`.
- Confirm `all` deploys `api`, `grpc`, and `worker` in one run.
- Confirm generated Cloud Run env vars match the expected runtime settings.
- Perform a manual smoke deploy after GitHub Environment variables and secrets are populated.

### Exit Criteria

- The repo has a documented, repeatable dev deployment path for Cashea GCP.
- The deploy path supports `api`, `grpc`, `worker`, and `all`.
- The GitHub Environment contract is explicit and testable.

## Stage 4: Sanitize Errors and Lock Down Operational Endpoints

### Goal

Prevent stack trace leakage and reduce accidental exposure of internal tooling.

### Current Gap

The app does not currently install a global exception filter, and Swagger is always enabled.

### Implementation Tasks

- Add a global exception filter that:
  - normalizes unexpected exceptions
  - removes stack traces and internal details from client responses
  - preserves enough structured logging for debugging
- Review controller-level exceptions and standardize error response shape.
- Disable Swagger entirely in production, or protect it with the same auth boundary as the API.
- Decide whether `/internal/jobs` endpoints should:
  - remain available only in non-production
  - stay enabled but protected
  - move behind a separate admin path
- Review health endpoints and decide whether to keep the current single `GET /health` or split into `live` and `ready`.

### Target Files

- `apps/api/src/main.ts`
- `apps/api/src/validation.controller.ts`
- `apps/api/src/health.controller.ts`
- new files under `apps/api/src/filters/`

### Verification

- Add tests that force an unhandled error and confirm the response does not include stack traces.
- Validate Swagger is unavailable or protected in production mode.
- Validate internal job endpoints follow the chosen access policy.

### Exit Criteria

- No unhandled exception leaks raw stack traces to clients.
- Swagger exposure is explicitly controlled by environment or auth.
- Operational endpoints have a documented exposure policy.

## Stage 5: Harden Build, Container, and CI Controls

### Goal

Make sure delivery paths enforce the same security baseline as the application code.

### Current Baseline

The repo already has:

- app-level Dockerfiles
- a root `.dockerignore`
- a GitHub Actions workflow that builds and runs tests

The plan here is to harden what exists, not recreate it from scratch.

### Implementation Tasks

- Review all three Dockerfiles for:
  - minimal runtime image
  - non-root execution
  - only required files copied into runtime
  - predictable startup command
  - pinned base image strategy if required by platform policy
- Decide whether a root `Dockerfile` is actually needed. If deployment is app-specific, document that the audit item is not applicable.
- Extend CI to include:
  - `npm run lint`
  - dependency vulnerability checks if the team accepts the noise profile
  - container or filesystem scanning if available in the platform
- Add repository ownership and update hygiene:
  - `CODEOWNERS`
  - `.github/dependabot.yml`
- Document branch protection expectations outside the repo if they are not configurable here.

### Target Files

- `apps/api/Dockerfile`
- `apps/worker/Dockerfile`
- `apps/case-explorer/Dockerfile`
- `.github/workflows/typescript-ci.yml`
- `.github/dependabot.yml`
- `CODEOWNERS`

### Verification

- Build each app image locally or in CI after hardening changes.
- Confirm CI fails on lint or security gate violations.
- Confirm ownership files are recognized by GitHub after merge.

### Exit Criteria

- Dockerfiles meet the agreed runtime-hardening baseline.
- CI includes security-relevant checks in addition to build and tests.
- Repo ownership and dependency update automation are in place.

## Stage 6: Tighten TypeScript and Configuration Safety

### Goal

Reduce security bugs caused by weak typing or unchecked runtime configuration.

### Current Gap

`tsconfig.base.json` still allows `noImplicitAny: false` and `strictBindCallApply: false`. No centralized runtime config validation is visible in the current API entrypoints.

### Implementation Tasks

- Raise TypeScript strictness in controlled steps:
  - enable `strict`
  - or, at minimum, enable `noImplicitAny` and `strictBindCallApply`
  - fix resulting type debt in priority order
- Add runtime configuration validation for security-sensitive env vars:
  - auth settings
  - CORS origins
  - Swagger enablement
  - rate limit settings
- Document the required env vars for local, staging, and production.
- Re-check the audit claim about insecure DB TLS:
  - if DB transport config is added later, require TLS verification by default
  - if the app remains serverless without direct DB SSL config in repo, document the finding as not currently applicable

### Target Files

- `tsconfig.base.json`
- app-level config files if introduced
- `README.md` or dedicated environment documentation

### Verification

- Run the existing TypeScript build and test suite after each strictness change.
- Add tests for invalid env configuration where practical.
- Confirm startup fails fast when required security config is missing or malformed.

### Exit Criteria

- TypeScript strictness is materially improved without hidden `any` regressions.
- Security-sensitive configuration is validated at startup.
- The DB TLS finding is either fixed or explicitly closed as not applicable.

## Stage 7: Repository Hygiene, Team Guidance, and Final Verification

### Goal

Close low-severity gaps, leave a documented operating model, and verify the full remediation set before rollout.

### Implementation Tasks

- Add `CLAUDE.md` only if the team actually uses Claude-based coding workflows and wants repo-level instructions there.
- Add `.claude/rules/` only if it is part of the team workflow. Do not add tool-specific files with no owner.
- Update docs with:
  - auth model
  - local development instructions
  - production behavior for Swagger and internal endpoints
  - operational troubleshooting for rate limiting and auth failures
- Run the full verification sequence:
  - `npm run build`
  - API tests
  - worker tests
  - case explorer tests
  - lint
  - any new security smoke tests
- Prepare rollout in this order:
  - merge code behind config flags if needed
  - deploy to a non-production environment
  - validate auth, Swagger restrictions, and throttling
  - promote to production after smoke checks

### Target Files

- `docs/`
- optional `CLAUDE.md`
- optional `.claude/rules/`
- `.github/workflows/typescript-ci.yml`

### Verification

- Execute the full regression suite.
- Perform a manual smoke test against deployed API endpoints.
- Confirm documentation reflects the actual deployed security model.

### Exit Criteria

- Remaining low-priority items are either implemented or explicitly deferred.
- The repo documents how the security controls work.
- The team has a repeatable verification path for future changes.

## Recommended Execution Order

1. Stage 0: reconcile the audit
2. Stage 1: add auth boundary
3. Stage 2: harden the HTTP surface
4. Stage 3: integrate with Cashea CI/CD and dev environment
5. Stage 4: sanitize errors and lock down operational endpoints
6. Stage 5: harden build, container, and CI controls
7. Stage 6: tighten TypeScript and config safety
8. Stage 7: finish hygiene items and run final verification

## Notes for Implementation

- The highest-risk gap remains missing API authentication.
- The current repo already covers some items from the audit, so implementation should not blindly mirror the PDF.
- The fastest path is to complete Stages 0 through 4 first, because they reduce deployment risk and direct exposure of the running API.
