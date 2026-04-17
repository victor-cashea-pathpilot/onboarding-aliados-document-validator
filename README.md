# AI Legal Document Validation

TypeScript platform for Cashea legal document validation and onboarding decisioning.

## Overview

The system receives typed document URLs, extracts structured evidence with Gemini, normalizes the case, runs deterministic and LLM-based validation, and returns an operational verdict:

- `APPROVED`
- `REQUIRES_REVIEW`
- `REJECTED`

## Runtime architecture

- `Cloud Run — API Service`
- `Cloud Run — Worker Service`
- `Cloud Run — Case Explorer`
- `Firestore`
- `Cloud Tasks`
- `Vertex AI Gemini 2.5 Flash / Pro`
- `Cloud Logging / Monitoring`
- `IAP` for browser access to the Case Explorer

## Repository structure

```text
apps/
  api/
  worker/
  case-explorer/
packages/
  contracts/
  domain/
  infrastructure/
infra/
  gcp/
docs/
scripts/
eval_cases/
```

## Services

### API

Main endpoints:

- `POST /validate`
- `POST /status`
- `GET /internal/jobs/:jobId`
- `GET /internal/jobs`

### Worker

Responsible for:

- document intake
- extraction
- normalization
- cross-validation
- legal assessment
- final persistence to Firestore

### Case Explorer

Internal webapp for:

- browsing cases
- reviewing final outcomes
- inspecting workflow steps
- inspecting `Input / Prompt / Output` per node

## Local development

Install dependencies:

```bash
npm ci
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm run test:ts:infrastructure
npm run test:ts:api
npm run test:ts:worker
npm run test:ts:case-explorer
```

Run locally in watch mode:

```bash
npm run start:api:dev
npm run start:worker:dev
npm run start:case-explorer:dev
```

## GCP deployment

See:

- [`/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/infra/gcp/README.md`](/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/infra/gcp/README.md)

Main scripts:

- `infra/gcp/bootstrap.sh`
- `infra/gcp/deploy_api.sh`
- `infra/gcp/deploy_worker.sh`
- `infra/gcp/deploy_case_explorer.sh`
- `infra/gcp/deploy_all.sh`
- `infra/gcp/smoke_test.sh`

## Documentation

- [`/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/API_Spec_v2.md`](/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/API_Spec_v2.md)
- [`/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/Architecture_v2.md`](/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/Architecture_v2.md)
- [`/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/Architecture_Current_vs_Target.md`](/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/Architecture_Current_vs_Target.md)
- [`/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/Stages_Plan_v1.md`](/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/Stages_Plan_v1.md)

## Git workflow

- feature branches should normally branch off `develop`
- pull requests should target `develop` by default
