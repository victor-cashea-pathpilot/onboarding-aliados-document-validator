#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
gcloud_auth_healthcheck

IMAGE="$(ts_worker_image)"
echo "Building TypeScript worker image: $IMAGE"
build_and_push_image "$ROOT_DIR/apps/worker/Dockerfile" "$IMAGE"

echo "Deploying TypeScript worker scaffold..."
gcloud run deploy "$TS_WORKER_SERVICE_NAME" \
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
TS_MIGRATION_PHASE=1,\
TS_SERVICE_NAME=worker

grant_service_invoker "$TS_WORKER_SERVICE_NAME" "serviceAccount:${CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL}"

echo "TypeScript worker URL: $(ts_worker_url)"
