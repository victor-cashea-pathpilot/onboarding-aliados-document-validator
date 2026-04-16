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

### Phase 7: Cutover and cleanup

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
- Python stack retired or archived

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
