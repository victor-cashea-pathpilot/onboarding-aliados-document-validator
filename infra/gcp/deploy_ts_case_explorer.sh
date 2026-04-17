#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
require_case_explorer_env
gcloud_auth_healthcheck

IMAGE="$(ts_case_explorer_image)"
echo "Building TypeScript Case Explorer image: $IMAGE"
build_and_push_image "$ROOT_DIR/apps/case-explorer/Dockerfile" "$IMAGE"

ALLOW_FLAG="--no-allow-unauthenticated"
if [[ "${TS_CASE_EXPLORER_ALLOW_UNAUTHENTICATED}" == "true" ]]; then
  ALLOW_FLAG="--allow-unauthenticated"
fi

echo "Deploying TypeScript Case Explorer scaffold..."
gcloud run deploy "$TS_CASE_EXPLORER_SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --service-account "$CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  --cpu "$CASE_EXPLORER_CPU" \
  --memory "$CASE_EXPLORER_MEMORY" \
  --timeout "$CASE_EXPLORER_TIMEOUT" \
  --concurrency "$CASE_EXPLORER_CONCURRENCY" \
  --min-instances "$CASE_EXPLORER_MIN_INSTANCES" \
  --max-instances "$CASE_EXPLORER_MAX_INSTANCES" \
  $ALLOW_FLAG \
  --image "$IMAGE" \
  --set-env-vars \
ENVIRONMENT="$ENVIRONMENT",\
LOG_LEVEL="$LOG_LEVEL",\
TS_MIGRATION_PHASE=1,\
TS_SERVICE_NAME=case-explorer,\
CASE_EXPLORER_API_URL="${CASE_EXPLORER_API_URL:-$(ts_api_url)}",\
CASE_EXPLORER_API_AUDIENCE="${CASE_EXPLORER_API_AUDIENCE:-${CASE_EXPLORER_API_URL:-$(ts_api_url)}}" 

grant_service_invoker "$TS_API_SERVICE_NAME" "serviceAccount:${CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL}"

echo "TypeScript Case Explorer URL: $(ts_case_explorer_url)"
