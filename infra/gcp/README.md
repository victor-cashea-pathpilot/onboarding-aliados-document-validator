# GCP Deployment

This folder is the operational source of truth for deploying the TypeScript stack to Google Cloud.

## Services

The current runtime is composed of:

- `Cloud Run — API Service`
- `Cloud Run — Worker Service`
- `Cloud Run — Case Explorer`
- `Firestore`
- `Cloud Tasks`
- `Vertex AI`
- `Cloud Logging / Monitoring`
- `IAP` for browser access to the Case Explorer

## Docker images

The services build from the root of the repo and publish to `Artifact Registry`.

Dockerfiles:

- API: `apps/api/Dockerfile`
- Worker: `apps/worker/Dockerfile`
- Case Explorer: `apps/case-explorer/Dockerfile`

Image names:

- API:
  - `${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/onboarding-api:${IMAGE_TAG}`
- Worker:
  - `${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/onboarding-worker:${IMAGE_TAG}`
- Case Explorer:
  - `${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/onboarding-case-explorer:${IMAGE_TAG}`

These image paths are resolved in `infra/gcp/common.sh`.

Examples:

```bash
docker build -f apps/api/Dockerfile -t onboarding-api:local .
docker build -f apps/worker/Dockerfile -t onboarding-worker:local .
docker build -f apps/case-explorer/Dockerfile -t onboarding-case-explorer:local .
```

## Environment templates

Start from one of the templates:

```bash
cp infra/gcp/env.dev.template infra/gcp/.env.dev
source infra/gcp/.env.dev
```

The generic service names now point to the TypeScript stack.

Key variables:

- `PROJECT_ID`
- `REGION`
- `FIRESTORE_LOCATION`
- `FIRESTORE_DATABASE`
- `FIRESTORE_COLLECTION`
- `ARTIFACT_REPOSITORY`
- `CLOUD_TASKS_QUEUE_ID`
- `API_SERVICE_NAME`
- `WORKER_SERVICE_NAME`
- `CASE_EXPLORER_SERVICE_NAME`
- `API_RUNTIME_SERVICE_ACCOUNT_EMAIL`
- `WORKER_RUNTIME_SERVICE_ACCOUNT_EMAIL`
- `CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL`
- `CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL`
- `WORKER_AUTH_TOKEN`
- `WEBAPP_SESSION_SECRET`
- `CASE_EXPLORER_ENABLE_IAP`
- `CASE_EXPLORER_IAP_MEMBERS`
- `GEMINI_LOCATION`
- `GEMINI_MODEL_SIMPLE`
- `GEMINI_MODEL_COMPLEX`
- `IMAGE_TAG`

## Scripts

- `bootstrap.sh`
  - enables required APIs
  - creates Firestore if needed
  - creates Artifact Registry if needed
  - creates the Cloud Tasks queue
  - creates service accounts and IAM bindings

- `deploy_api.sh`
  - builds the API image
  - pushes to Artifact Registry
  - deploys the API to Cloud Run

- `deploy_worker.sh`
  - builds the worker image
  - pushes to Artifact Registry
  - deploys the worker to Cloud Run

- `deploy_case_explorer.sh`
  - builds the Case Explorer image
  - pushes to Artifact Registry
  - deploys the webapp to Cloud Run
  - configures IAP/browser access

- `deploy_all.sh`
  - runs:
    - `bootstrap.sh`
    - `deploy_worker.sh`
    - `deploy_api.sh`
    - `deploy_case_explorer.sh`

- `smoke_test.sh`
  - checks API health
  - submits a smoke-test case
  - polls until `COMPLETED` or `FAILED`

- `deploy_observability.sh`
  - applies log metrics and dashboards

## Typical deployment flow

```bash
source infra/gcp/.env.dev
bash infra/gcp/bootstrap.sh
bash infra/gcp/deploy_worker.sh
bash infra/gcp/deploy_api.sh
bash infra/gcp/deploy_case_explorer.sh
```

Or as a single command:

```bash
source infra/gcp/.env.dev
bash infra/gcp/deploy_all.sh
```

## Smoke test

```bash
source infra/gcp/.env.dev
bash infra/gcp/smoke_test.sh
```

## Listing images

```bash
gcloud artifacts docker images list \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}
```

## Security model

- API: authenticated access
- Worker: private, invoked by `Cloud Tasks` with `OIDC`
- Case Explorer: protected with `IAP / Google login`
- Firestore: internal source of truth, not exposed directly to clients
- Vertex AI: accessed via IAM and service accounts
