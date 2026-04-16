#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
gcloud_auth_healthcheck

WORKER_URL="${TS_WORKER_BASE_URL:-$(worker_url)}"
IMAGE="$(ts_api_image)"
echo "Building TypeScript API image: $IMAGE"
build_and_push_image "$ROOT_DIR/apps/api/Dockerfile" "$IMAGE"

ALLOW_FLAG="--no-allow-unauthenticated"
if [[ "${TS_API_ALLOW_UNAUTHENTICATED}" == "true" ]]; then
  ALLOW_FLAG="--allow-unauthenticated"
fi

echo "Deploying TypeScript API..."
gcloud run deploy "$TS_API_SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --service-account "$API_RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  --cpu "$API_CPU" \
  --memory "$API_MEMORY" \
  --timeout "$API_TIMEOUT" \
  --concurrency "$API_CONCURRENCY" \
  --min-instances "$API_MIN_INSTANCES" \
  --max-instances "$API_MAX_INSTANCES" \
  $ALLOW_FLAG \
  --image "$IMAGE" \
  --set-env-vars \
ENVIRONMENT="$ENVIRONMENT",\
LOG_LEVEL="$LOG_LEVEL",\
GCP_PROJECT_ID="$PROJECT_ID",\
GCP_REGION="$REGION",\
FIRESTORE_DATABASE="$FIRESTORE_DATABASE",\
FIRESTORE_COLLECTION="$FIRESTORE_COLLECTION",\
CLOUD_TASKS_QUEUE_ID="$CLOUD_TASKS_QUEUE_ID",\
CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL="$CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL",\
WORKER_BASE_URL="$WORKER_URL",\
WORKER_AUDIENCE="$WORKER_URL",\
WORKER_AUTH_TOKEN="$WORKER_AUTH_TOKEN",\
DOWNLOAD_TIMEOUT_SECONDS="$DOWNLOAD_TIMEOUT_SECONDS",\
MAX_DOCUMENT_SIZE_BYTES="$MAX_DOCUMENT_SIZE_BYTES",\
GEMINI_LOCATION="$GEMINI_LOCATION",\
GEMINI_MODEL_SIMPLE="$GEMINI_MODEL_SIMPLE",\
GEMINI_MODEL_COMPLEX="$GEMINI_MODEL_COMPLEX",\
TS_MIGRATION_PHASE=4,\
TS_SERVICE_NAME=api

echo "TypeScript API URL: $(ts_api_url)"
