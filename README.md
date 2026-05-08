# AI Legal Document Validation

TypeScript / NestJS platform for Cashea legal document validation and onboarding decisioning.

## What it does

The system receives typed document URLs, extracts structured evidence with Gemini, normalizes the case, runs deterministic and LLM-based validation, and returns an operational verdict:

- `APPROVED`
- `REQUIRES_REVIEW`
- `REJECTED`

## Services

### REST API (`apps/api`)

HTTP entrypoint for Cashea and internal consumers.

| Endpoint | Purpose |
|---|---|
| `POST /v1/onboarding/validate` | Submit a validation job |
| `POST /v1/onboarding/status` | Poll job status |
| `GET /internal/jobs` | List all jobs (internal) |
| `GET /internal/jobs/:jobId` | Get a single job (internal) |
| `GET /health` | Health check |

Cloud Run service: `backend-ms-ldv-api-service`

### gRPC API (`apps/api-grpc`)

gRPC entrypoint for backend-to-backend callers in GCP. Shares the same domain and infrastructure layer as the REST API.

Proto contract: `packages/contracts/proto/onboarding/v1/onboarding.proto`

| Method | Purpose |
|---|---|
| `GetHealth` | Health check |
| `SubmitValidation` | Submit a validation job |
| `GetStatus` | Poll status for one or more job IDs |

Cloud Run service: `backend-ms-ldv-grpc-service`

### Worker (`apps/worker`)

Async processor invoked by Cloud Tasks via OIDC. Handles the full validation pipeline per job:

1. Document intake (download + MIME/size validation)
2. Parallel extraction per document type (Gemini 2.5 Flash / Pro)
3. Canonical normalization
4. Deterministic cross-validation checks
5. LLM cross-validation
6. LLM legal assessment
7. Final verdict persistence to Firestore

Cloud Run service: `backend-ms-ldv-worker-service`

### Case Explorer (`apps/case-explorer`)

Internal webapp for inspecting validation jobs. Reads from the API's internal endpoints.

Features:
- Job list with status badges and pagination
- Per-job detail: documents, extracted data, cross-validation checks, LLM findings, final verdict
- Prompt / input / output inspection per pipeline node

Cloud Run service: `backend-ms-ldv-explorer-service`

---

## Architecture

```
Cashea / caller
      │
      ▼
 REST API  ──or──  gRPC API
      │                │
      └────────┬────────┘
               │ Cloud Tasks (OIDC)
               ▼
            Worker
          ┌────┴─────┐
          │          │
       Firestore  Vertex AI
                  (Gemini 2.5)
```

**GCP stack:**
- Cloud Run (API, gRPC, Worker, Explorer)
- Firestore — job state and results
- Cloud Tasks — async dispatch with OIDC delivery
- Vertex AI Gemini 2.5 Flash / Pro — extraction, cross-validation, legal assessment
- GCP Secret Manager — `WORKER_AUTH_TOKEN`, `WEBAPP_SESSION_SECRET`
- Artifact Registry — container images
- Cloud Logging / Monitoring — structured logs and dashboards

**Current environment:** `core-allies-dev` / `us-east1`

---

## Repository structure

```text
apps/
  api/                     REST API (NestJS HTTP)
  api-grpc/                gRPC API (NestJS Microservice)
  worker/                  Async job processor
  case-explorer/           Internal webapp
packages/
  contracts/               Proto definitions, shared types
  domain/                  Domain models and interfaces
  infrastructure/          Firestore, Cloud Tasks, Vertex AI adapters
infra/
  cicd/                    CI/CD scripts and deploy config
    deploy-config.dev.yaml   Service definitions and settings for dev
    render_cloud_run_env.sh  Renders Cloud Run env yaml from config + env vars
    build_and_push_service.sh
    deploy_cloud_run_service.sh
docs/                      Technical reference documentation
plans/                     Past planning documents
eval_cases/                Evaluation fixtures
scripts/                   Utility scripts
```

---

## Local development

```bash
npm ci
npm run build

# Run in watch mode
npm run start:api:dev
npm run start:worker:dev
npm run start:case-explorer:dev

# Tests
npm run test:ts:infrastructure
npm run test:ts:api
npm run test:ts:worker
npm run test:ts:case-explorer
```

---

## CI/CD and deployment

Deployments go through GitHub Actions. The main workflow is `.github/workflows/deploy-cloud-run-dev.yml`.

**Automatic:** push to `develop` deploys all services.

**Manual:** `workflow_dispatch` with a `deploy_target` input (`api`, `grpc`, `worker`, `explorer`, `all`).

The deploy pipeline for each service:
1. `render_cloud_run_env.sh` — builds a Cloud Run env YAML from GitHub variables and live service URLs
2. `build_and_push_service.sh` — builds the Docker image and pushes to Artifact Registry
3. `deploy_cloud_run_service.sh` — deploys to Cloud Run, wires Secret Manager secrets

Runtime secrets (`WORKER_AUTH_TOKEN`, `WEBAPP_SESSION_SECRET`) are never stored in GitHub. They are injected from GCP Secret Manager at deploy time via `--set-secrets`.

See `infra/cicd/deploy-config.dev.yaml` for all service definitions, image names, resource sizing, ingress settings, and secret wiring.

---

## Git workflow

- Feature branches off `develop`
- Pull requests target `develop`
- `main` is production

---

## Documentation

### Technical reference (`docs/`)

| Doc | Contents |
|---|---|
| [`API_Spec_v2.md`](docs/API_Spec_v2.md) | REST API contract — endpoints, request/response shapes, async model |
| [`API_Authentication_v1.md`](docs/API_Authentication_v1.md) | Auth model for REST and gRPC |
| [`Architecture_v2.md`](docs/Architecture_v2.md) | Component breakdown and infrastructure requirements |
| [`Architecture_Current_vs_Target.md`](docs/Architecture_Current_vs_Target.md) | Current vs target architecture comparison |
| [`Real_Test_Cases_v1.md`](docs/Real_Test_Cases_v1.md) | How to run real test cases locally without committing documents |
| [`Legal_Manual_Phase_1_README.md`](docs/Legal_Manual_Phase_1_README.md) | Legal validation rules reference |

### Past plans (`plans/`)

| Plan | Contents |
|---|---|
| [`Backend_Validation_Plan_v1.md`](plans/Backend_Validation_Plan_v1.md) | 5-stage GCP dev backend validation — executed May 2026 |
| [`Stages_Plan_v1.md`](plans/Stages_Plan_v1.md) | Original 12-stage implementation roadmap |
| [`gRPC_Support_Plan_v1.md`](plans/gRPC_Support_Plan_v1.md) | gRPC rollout decision and staged plan |
| [`Cashea_CICD_Dev_v1.md`](plans/Cashea_CICD_Dev_v1.md) | Initial CI/CD setup for `core-allies-dev` |
| [`Security_Remediation_Plan_v1.md`](plans/Security_Remediation_Plan_v1.md) | Security findings and remediation steps |
