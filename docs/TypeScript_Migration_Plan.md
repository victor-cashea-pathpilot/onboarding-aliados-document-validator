# TypeScript Migration Plan

## Objective

Migrate the current Python-based onboarding agent stack to TypeScript while aligning, as much as practical, with the Cashea `ms-template`:

- Template reference: `git@github-cashea:cashea-bnpl/ms-template.git`
- Current migration branch: `codex/typescript-migration-plan`

This plan is intentionally pragmatic. It aims to preserve the current working GCP architecture and business logic while adopting the structure, tooling, and conventions expected by Cashea.

## Decisions confirmed

The following migration decisions were already agreed:

- We should comply with `ms-template` as much as possible because it is the recommendation from the Security team.
- `Firestore` remains the source of truth for now.
- Multiple deployable services are required and acceptable:
  - API
  - Worker
  - Case Explorer
- If we introduce SQL/relational persistence in the future, it should follow the template's ORM guidance.
- The migration should happen in phases, not as a big-bang rewrite.

## Current state

The current project is not a single service. It is a small platform with three deployable applications:

1. `backend/api`
   - FastAPI public API
   - `POST /validate`
   - `POST /status`
   - internal case explorer endpoints

2. `backend/worker`
   - FastAPI worker
   - asynchronous job processing
   - document intake
   - extraction
   - normalization
   - cross-validation
   - legal assessment

3. `webapp`
   - internal Case Explorer UI
   - today implemented as FastAPI + Jinja templates

Supporting runtime components already in use:

- Firestore
- Cloud Tasks
- Vertex AI Gemini
- Cloud Logging / Monitoring
- IAP for the internal webapp

## What the template gives us

The `ms-template` is a NestJS TypeScript service template with:

- NestJS app bootstrap
- `ConfigModule`
- Swagger
- health/readiness patterns
- module-oriented structure
- `entrypoints / domain / external / config`
- TypeORM + PostgreSQL example wiring
- standard npm/TypeScript tooling

This is useful for:

- service structure
- dependency injection
- validation DTO patterns
- API documentation
- consistent Cashea service conventions

But it does **not** match our stack 1:1:

- it assumes a single NestJS service
- it includes TypeORM/Postgres examples
- it does not model Firestore + Cloud Tasks + separate worker + internal webapp out of the box

## Recommendation

Do **not** do a big-bang rewrite.

Use the template as the structural baseline, then migrate in phases:

- first the public API service
- then the worker
- then the internal Case Explorer

Keep the current infrastructure model:

- Firestore
- Cloud Tasks
- Vertex AI
- Cloud Run

Do **not** force the system into Postgres/TypeORM unless Cashea explicitly requires that architectural change.

## Target TypeScript architecture

Recommended target repo structure:

```text
apps/
  api/
  worker/
  case-explorer/
packages/
  domain/
  application/
  infrastructure/
  contracts/
  prompts/
  shared/
infra/
  gcp/
```

### Apps

- `apps/api`
  - NestJS
  - public API endpoints
  - internal case endpoints for the explorer

- `apps/worker`
  - NestJS app or worker-oriented Nest entrypoint
  - Cloud Tasks job handler
  - processing orchestration

- `apps/case-explorer`
  - either:
    - NestJS server-rendered app, or
    - Next.js app
  - for the first migration phase, a simple Nest-rendered server app is acceptable if we want to minimize moving parts

### Shared packages

- `packages/contracts`
  - request/response DTOs
  - job status contracts

- `packages/domain`
  - canonical models
  - legal mode logic
  - validation rules

- `packages/application`
  - orchestrators / use cases
  - normalization
  - cross-validation

- `packages/infrastructure`
  - Firestore repository
  - Cloud Tasks dispatcher
  - Vertex AI client
  - signed URL helpers

- `packages/prompts`
  - extraction prompts
  - cross-validation prompts
  - legal assessment prompts

- `packages/shared`
  - config
  - logging
  - date helpers
  - common utilities

## Migration principles

1. Preserve business behavior before improving architecture.
2. Keep the current Firestore + Cloud Tasks flow unless explicitly told otherwise.
3. Migrate deterministic logic before attempting to optimize or redesign.
4. Reuse current prompts and eval fixtures as regression protection.
5. Maintain deployability at each phase.

## Proposed migration phases

### Phase 1: Workspace scaffold and standards adoption

Goal:
- create the TypeScript/Nest scaffold without changing production behavior

Tasks:
- initialize npm workspace or pnpm workspace
- bring in NestJS conventions from `ms-template`
- define shared package boundaries
- create base `tsconfig`, lint, format, test tooling
- create placeholder apps for:
  - API
  - Worker
  - Case Explorer
- create initial shared packages for:
  - contracts
  - domain

Deliverables:
- TypeScript workspace scaffold
- minimal Nest apps for `api`, `worker`, and `case-explorer`
- initial `contracts` and `domain` packages
- CI job for install/build/test of TS workspace
- phase 1 validation path for local Docker build and parallel Cloud Run deployment

Status on this branch:

- completed initial workspace scaffold
- added root TypeScript/Nest tooling inspired by `ms-template`
- created placeholder Nest apps for:
  - `apps/api`
  - `apps/worker`
  - `apps/case-explorer`
- created initial shared packages for:
  - `packages/contracts`
  - `packages/domain`
- validated with:
  - `npm install`
  - `npm run build`

### Phase 1 validation: parallel deployment checkpoint

Goal:
- prove the TypeScript scaffold can be built, containerized, and deployed in GCP without replacing the Python stack

Tasks:
- add Dockerfiles for:
  - `apps/api`
  - `apps/worker`
  - `apps/case-explorer`
- add GCP deploy scripts for parallel validation services
- use distinct Cloud Run service names and Artifact Registry images so validation does not interfere with Python services
- validate:
  - `npm run build`
  - local Docker builds
  - optional Cloud Run deployment in the current GCP project

Deliverables:
- deployable container images for the TS scaffold
- parallel deploy scripts for TS validation
- documented path to run health checks in GCP

Status on this branch:

- completed local Docker validation for:
  - `apps/api`
  - `apps/worker`
  - `apps/case-explorer`
- added parallel GCP deploy scripts for the TS scaffold:
  - `deploy_ts_api.sh`
  - `deploy_ts_worker.sh`
  - `deploy_ts_case_explorer.sh`
  - `deploy_ts_phase1_validation.sh`
- documented validation flow in `infra/gcp/README.md`
- completed parallel GCP deploy validation for scaffold services:
  - `onboarding-api-ts-dev`
  - `onboarding-worker-ts-dev`
  - `onboarding-case-explorer-ts-dev`
- validated health endpoints in Cloud Run

### Phase 2: Contracts and domain model port

Goal:
- port the stable contracts and domain logic first

Tasks:
- migrate current Python contracts to TypeScript DTOs/interfaces
- migrate canonical snapshot model
- migrate legal mode types
- migrate deterministic validation rule structures
- port prompt-builder signatures into TS

Deliverables:
- TS contracts package
- TS canonical/domain package
- unit tests for model parity

Status on this branch:

- started
- ported core contract types for:
  - submit/status flows
  - document buckets
  - document results
  - cross-validation outputs
  - case explorer responses
- ported domain types for:
  - legal mode
  - cédula policy outcome
  - canonical merchant snapshot
  - job record shape
- validated compile compatibility with:
  - `npm run build`

### Phase 3: Infrastructure adapters

Goal:
- make the TypeScript code able to talk to the current GCP stack

Tasks:
- implement Firestore repository in TS
- implement Cloud Tasks dispatcher in TS
- implement Vertex AI Gemini client in TS
- implement config and structured logging in TS
- implement document download layer

Deliverables:
- working TS infrastructure package
- isolated tests for Firestore, Cloud Tasks, and Gemini wrappers

Status on this branch:

- completed
- created `packages/infrastructure`
- added shared TypeScript infrastructure building blocks for:
  - config loading
  - structured logging
  - repository interfaces
  - dispatcher interfaces
  - Gemini client interface
- implemented first real GCP adapters for:
  - Firestore job repository
  - Cloud Tasks job dispatcher
- implemented additional infrastructure adapters for:
  - Vertex AI Gemini client
  - document download layer
- added infrastructure tests for:
  - Firestore repository behavior
  - Cloud Tasks dispatch payloads
  - Gemini JSON parsing
  - document downloading and size limits
- validated compile compatibility with:
  - `npm run build`
- validated adapter tests with:
  - `npm run test:ts:infrastructure`

### Phase 4: API migration

Goal:
- replace the public FastAPI API with NestJS while keeping the same external contract

Tasks:
- implement:
  - `POST /validate`
  - `POST /status`
  - internal case endpoints
- preserve existing request/response shapes
- add Swagger docs
- wire API to current Firestore + Cloud Tasks flow

Deliverables:
- deployable NestJS API
- contract tests comparing Python vs TS behavior

Status on this branch:

- validated
- implemented the real TypeScript API flow for:
  - `POST /validate`
  - `POST /status`
- added minimal internal API endpoints for:
  - `GET /internal/jobs/{job_id}`
  - `GET /internal/jobs`
- wired the API to the current infrastructure adapters:
  - Firestore repository
  - Cloud Tasks dispatcher
- validated compile compatibility with:
  - `npm run build`
- added basic API service tests for:
  - submit job creation and dispatch
  - status lookup for missing jobs
- validated API tests with:
  - `npm run test:ts:api`
- deployed the TypeScript API to Cloud Run:
  - `onboarding-api-ts`
- fixed Firestore compatibility so the TS API writes Python-compatible `snake_case` job records
- validated a real end-to-end smoke test against the current Python worker:
  - authenticated `POST /validate`
  - `Cloud Tasks` dispatch
  - job execution in the existing worker
  - authenticated `POST /status`
  - final completed job visible from the TS API

### Phase 5: Worker migration

Goal:
- port the processing pipeline to TypeScript

Tasks:
- port:
  - document intake
  - extraction orchestration
  - normalization
  - cross-validation
  - legal assessment
  - result persistence
- preserve concurrency behavior already fixed in GCP
- preserve mercantile act precedence logic
- preserve cédula expiration policy

Deliverables:
- deployable TS worker
- regression suite against current evals

Status on this branch:

- started
- made the TypeScript worker contract-compatible with the current Cloud Tasks flow:
  - `POST /internal/process-job`
  - `job_id` payload
  - optional `X-Worker-Token`
- wired the TS worker to the shared Firestore repository
- added initial worker job lifecycle behavior:
  - unauthorized token rejection
  - missing job handling
  - transition from `PENDING` to initial `PROCESSING` progress state
- ported the first real processing slice:
  - document bucket expansion from the stored request payload
  - URL scheme validation
  - MIME type validation
  - document-level intake result persistence
  - structured intake logging
- ported the next processing slice:
  - extraction orchestration for intake-approved documents
  - Gemini model selection by document type
  - parallel extraction batching
  - document-level extraction result persistence
  - structured extraction logging
- ported the next processing slice:
  - canonical document normalization
  - company document chronological merge
  - field-level mercantile precedence
  - cédula expiration policy metadata in normalized snapshot
  - normalization result persistence in the worker
- added worker tests for:
  - token enforcement
  - missing job behavior
  - initial progress updates
  - document intake service behavior
  - document extraction service behavior
  - document normalization service behavior
  - persistence of document-level intake results
- validated worker tests with:
  - `npm run test:ts:worker`

### Phase 6: Case Explorer migration

Goal:
- move the internal UI to TypeScript

Tasks:
- choose target:
  - Nest-rendered app, or
  - Next.js internal app
- preserve:
  - recent jobs list
  - case detail
  - workflow monitor
  - prompt/input/output inspection
- preserve IAP-protected deployment model

Deliverables:
- deployable TS Case Explorer

### Phase 7: Cutover

Goal:
- switch GCP deploys from Python services to TypeScript services

Tasks:
- run shadow validation if desired
- deploy TS services to dev/staging
- run current real cases and evals
- compare outputs with Python baseline
- cut traffic to TS services
- deprecate Python services

Deliverables:
- TypeScript stack as source of truth

### Phase 8: Cleanup

Goal:
- remove transitional duplication after cutover and leave a clean TypeScript-first codebase

Tasks:
- archive or remove Python deploy paths no longer needed
- retire legacy Dockerfiles and scripts once the TS stack is the source of truth
- clean feature flags and migration-only compatibility shims
- update docs, diagrams, and operational runbooks to remove Python references
- confirm CI/CD only builds and deploys the TypeScript stack

Deliverables:
- Python stack retired or archived
- deployment and documentation cleanup completed

## What should be migrated first

Recommended order:

1. Workspace scaffold
2. Contracts
3. Canonical models
4. Deterministic validation rules
5. Firestore + Cloud Tasks adapters
6. API
7. Worker
8. Case Explorer

This order minimizes risk because:

- the team gets an agreed TypeScript shape immediately
- contracts and deterministic logic are easiest to validate
- worker migration is the riskiest part
- UI migration should not block platform correctness

## What should remain the same

These should stay unchanged through the migration:

- GCP runtime architecture
  - Cloud Run API
  - Cloud Run Worker
  - Firestore
  - Cloud Tasks
  - Vertex AI

- external API semantics
  - `POST /validate`
  - `POST /status`

- job status lifecycle
  - `PENDING`
  - `PROCESSING`
  - `COMPLETED`
  - `FAILED`

- current legal/decision logic
  - legal-mode-aware prompts
  - field-level mercantile precedence
  - cédula expiration > 10 years policy

## What should not be adopted blindly from the template

### TypeORM / PostgreSQL

The template uses TypeORM and Postgres examples.

Current recommendation:
- do **not** migrate job state to Postgres just to match the template
- keep Firestore as the operational source of truth unless Cashea explicitly wants a persistence redesign

### gRPC modules

The template contains gRPC examples.

Current recommendation:
- do not introduce gRPC unless there is a real integration requirement

### Single-app assumption

The template is centered around one service.

Current recommendation:
- adapt the conventions, not the exact one-app layout

## Regression strategy

The migration should use the existing eval framework as protection:

- unit tests
- logic evals
- extraction evals
- comprehensive evals
- real/manual cases

Add a parity layer where possible:

- same input -> same normalized snapshot
- same input -> same final verdict
- same input -> same critical findings

## Risks

### 1. Behavior drift

Risk:
- TS services produce different legal outputs than Python

Mitigation:
- parity tests
- eval fixtures
- case-by-case comparison in Case Explorer

### 2. Overfitting to template

Risk:
- trying to force Firestore/Cloud Tasks workflow into a Postgres-first template

Mitigation:
- use the template for structure and tooling, not as a rigid architecture mandate

### 3. Worker migration complexity

Risk:
- the worker contains most of the logic and concurrency details

Mitigation:
- migrate worker after contracts/domain/infrastructure are already stable

### 4. UI migration creep

Risk:
- spending too much time redesigning the internal UI during the migration

Mitigation:
- preserve current explorer behavior first, improve visuals later

## Suggested milestones

### Milestone 1
- TS workspace scaffold
- apps and shared packages created
- base standards from `ms-template` adopted
- local/GCP validation path defined for the scaffold

### Milestone 2
- TS workspace scaffold
- contracts migrated
- domain types migrated

### Milestone 3
- Firestore + Cloud Tasks + Vertex adapters migrated
- API migrated and deployable

### Milestone 4
- worker migrated and passing parity checks

### Milestone 5
- Case Explorer migrated
- full stack deployable in GCP

### Milestone 6
- cutover from Python to TypeScript

### Milestone 7
- cleanup of transitional Python assets and deploy paths

## Access needed

For the planning work, no extra access is needed beyond what is already available:

- read access to this repo
- read access to `cashea-bnpl/ms-template`

For execution, the main needs are not access but decisions:

1. Confirm whether the template must be followed:
   - strictly for repository layout and tooling only, or
   - also for persistence and service conventions

2. Confirm target for the internal UI:
   - keep server-rendered app, or
   - move to Next.js/React

3. Confirm whether Firestore remains the source of truth in the TypeScript version

4. Confirm whether the API contract must remain exactly backward compatible during migration

If helpful, the next step after this plan is to produce a **Phase 0 execution checklist** and generate the initial TypeScript workspace skeleton in this branch.
