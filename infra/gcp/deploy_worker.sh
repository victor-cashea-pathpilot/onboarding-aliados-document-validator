#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
gcloud_auth_healthcheck

IMAGE="$(worker_image)"
echo "Building worker image: $IMAGE"
build_and_push_image "$ROOT_DIR/apps/worker/Dockerfile" "$IMAGE"

echo "Deploying worker..."
gcloud run deploy "$WORKER_SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --service-account "$WORKER_RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  --cpu "$WORKER_CPU" \
  --memory "$WORKER_MEMORY" \
  --timeout "$WORKER_TIMEOUT" \
  --concurrency "$WORKER_CONCURRENCY" \
  --min-instances "$WORKER_MIN_INSTANCES" \
  --max-instances "$WORKER_MAX_INSTANCES" \
  --no-allow-unauthenticated \
  --image "$IMAGE" \
  --set-env-vars \
ENVIRONMENT="$ENVIRONMENT",\
LOG_LEVEL="$LOG_LEVEL",\
GCP_PROJECT_ID="$PROJECT_ID",\
GCP_REGION="$REGION",\
FIRESTORE_DATABASE="$FIRESTORE_DATABASE",\
FIRESTORE_COLLECTION="$FIRESTORE_COLLECTION",\
JOB_REPOSITORY_MODE=firestore,\
JOB_QUEUE_MODE=inline,\
WORKER_AUTH_TOKEN="$WORKER_AUTH_TOKEN",\
MOCK_MODE="$MOCK_MODE",\
DOWNLOAD_TIMEOUT_SECONDS="$DOWNLOAD_TIMEOUT_SECONDS",\
MAX_DOCUMENT_SIZE_BYTES="$MAX_DOCUMENT_SIZE_BYTES",\
GEMINI_LOCATION="$GEMINI_LOCATION",\
GEMINI_MODEL_SIMPLE="$GEMINI_MODEL_SIMPLE",\
GEMINI_MODEL_COMPLEX="$GEMINI_MODEL_COMPLEX",\
MAX_EXTRACTION_CONCURRENCY="$MAX_EXTRACTION_CONCURRENCY",\
ENABLE_LLM_CROSS_VALIDATION="$ENABLE_LLM_CROSS_VALIDATION",\
ENABLE_LLM_LEGAL_ASSESSMENT="$ENABLE_LLM_LEGAL_ASSESSMENT",\
TS_SERVICE_NAME=worker

grant_service_invoker "$WORKER_SERVICE_NAME" "serviceAccount:${CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL}"

echo "Worker URL: $(worker_url)"
