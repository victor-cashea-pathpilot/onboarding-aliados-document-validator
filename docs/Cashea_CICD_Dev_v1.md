# Cashea CI/CD Dev Setup

This document describes the first repository-local CI/CD slice for deploying the legal document validation stack into Cashea `core-allies-dev`.

## Scope

Stage 1 deploy targets:

- API
- gRPC API
- Worker

Fast follow:

- Explorer

The workflow is intentionally manual-first through `workflow_dispatch`.

## Deploy Topology

Environment:

- project: `core-allies-dev`
- region: `us-east1`
- artifact registry repository: `cashea-repo`
- firestore database: `legal-doc-validation`
- firestore collection: `validation_jobs`
- cloud tasks queue: `legal-validation-jobs`

Cloud Run services:

- API: `backend-ms-ldv-api-service`
- gRPC API: `backend-ms-ldv-grpc-service`
- Worker: `backend-ms-ldv-worker-service`
- Explorer: `backend-ms-ldv-explorer-service`

Runtime service accounts:

- API: `allies-ldv-api-sa-cr@core-allies-dev.iam.gserviceaccount.com`
- gRPC API: `allies-ldv-api-sa-cr@core-allies-dev.iam.gserviceaccount.com`
- Worker: `allies-ldv-worker-sa-cr@core-allies-dev.iam.gserviceaccount.com`
- Explorer: `allies-ldv-explorer-sa-cr@core-allies-dev.iam.gserviceaccount.com`

Note:

- The first dev pass reuses the API runtime service account for the gRPC service.
- A dedicated gRPC runtime service account can be introduced later once DevOps provisions it.

## GitHub Environment

Create a GitHub Environment named `dev`.

### Required Secrets

- `GCP_SA_KEY_DEV`
  Recommended to be the temporary deploy key for the Cashea CI/CD service account. In the current Cashea dev project, `sa-cicd@cashea-cicd.iam.gserviceaccount.com` already appears in service-account `actAs` bindings and is the best candidate if DevOps provides the key.
- `WORKER_AUTH_TOKEN`
  Shared bearer token between the API/gRPC dispatchers and the worker internal processing endpoint.
- `WEBAPP_SESSION_SECRET`
  Not used by Stage 1, but reserved so the `explorer` fast-follow can reuse the same environment without renaming secrets.

### Required Variables

- `GCP_PROJECT_ID`
  Value: `core-allies-dev`
- `GCP_REGION`
  Value: `us-east1`
- `ARTIFACT_REPOSITORY`
  Value: `cashea-repo`
- `FIRESTORE_DATABASE`
  Value: `legal-doc-validation`
- `FIRESTORE_COLLECTION`
  Value: `validation_jobs`
- `CLOUD_TASKS_QUEUE_ID`
  Value: `legal-validation-jobs`

### Recommended Variables

- `LOG_LEVEL`
  Value: `INFO`
- `MOCK_MODE`
  Value: `false`
- `DOWNLOAD_TIMEOUT_SECONDS`
  Value: `20`
- `MAX_DOCUMENT_SIZE_BYTES`
  Value: `15728640`
- `MAX_EXTRACTION_CONCURRENCY`
  Value: `4`
- `GEMINI_LOCATION`
  Value: `global`
- `GEMINI_MODEL_SIMPLE`
  Value: `gemini-2.5-flash`
- `GEMINI_MODEL_COMPLEX`
  Value: `gemini-2.5-pro`
- `ENABLE_LLM_CROSS_VALIDATION`
  Value: `true`
- `ENABLE_LLM_LEGAL_ASSESSMENT`
  Value: `true`

### Optional Overrides

- `WORKER_BASE_URL`
- `WORKER_AUDIENCE`
- `CASE_EXPLORER_API_URL`
- `CASE_EXPLORER_API_AUDIENCE`

These are only needed if the workflow should avoid resolving current service URLs directly from Cloud Run.

## Workflow

Workflow file:

- `.github/workflows/deploy-cloud-run-dev.yml`

Inputs:

- `api`
- `grpc`
- `worker`
- `all`

The workflow:

- authenticates with `GCP_SA_KEY_DEV`
- reads deploy defaults from `infra/cicd/deploy-config.dev.yaml`
- renders a Cloud Run env yaml from GitHub Environment secrets and variables
- builds and pushes the selected image to Artifact Registry
- deploys the selected Cloud Run service to `core-allies-dev`

## Future Migration

This first pass uses a temporary JSON key so the team can deploy immediately.

Planned follow-up:

- replace `GCP_SA_KEY_DEV` with GitHub OIDC plus Workload Identity Federation
- add staging and production environments
- add Explorer to the deploy target list
- align with the long-term Cashea platform standard once DevOps confirms the final deploy lane
