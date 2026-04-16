#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
gcloud_auth_healthcheck

IMAGE="$(ts_api_image)"
echo "Building TypeScript API image: $IMAGE"
build_and_push_image "$ROOT_DIR/apps/api/Dockerfile" "$IMAGE"

ALLOW_FLAG="--no-allow-unauthenticated"
if [[ "${TS_API_ALLOW_UNAUTHENTICATED}" == "true" ]]; then
  ALLOW_FLAG="--allow-unauthenticated"
fi

echo "Deploying TypeScript API scaffold..."
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
TS_MIGRATION_PHASE=1,\
TS_SERVICE_NAME=api

echo "TypeScript API URL: $(ts_api_url)"
