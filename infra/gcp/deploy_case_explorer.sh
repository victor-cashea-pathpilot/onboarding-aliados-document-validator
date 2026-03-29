#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
require_case_explorer_env
gcloud_auth_healthcheck

API_URL_VALUE="${CASE_EXPLORER_API_URL:-$(api_url)}"
API_AUDIENCE_VALUE="${CASE_EXPLORER_API_AUDIENCE:-$API_URL_VALUE}"
IMAGE="$(case_explorer_image)"

echo "Building case explorer image: $IMAGE"
build_and_push_image "$ROOT_DIR/webapp/Dockerfile" "$IMAGE"

echo "Deploying case explorer webapp..."
gcloud run deploy "$CASE_EXPLORER_SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --service-account "$CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  --allow-unauthenticated \
  --cpu "$CASE_EXPLORER_CPU" \
  --memory "$CASE_EXPLORER_MEMORY" \
  --timeout "$CASE_EXPLORER_TIMEOUT" \
  --concurrency "$CASE_EXPLORER_CONCURRENCY" \
  --min-instances "$CASE_EXPLORER_MIN_INSTANCES" \
  --max-instances "$CASE_EXPLORER_MAX_INSTANCES" \
  --image "$IMAGE" \
  --set-env-vars "^##^ENVIRONMENT=$ENVIRONMENT##LOG_LEVEL=$LOG_LEVEL##WEBAPP_TITLE=Onboarding Case Explorer##WEBAPP_SESSION_SECRET=$WEBAPP_SESSION_SECRET##CASE_EXPLORER_AUTH_MODE=$CASE_EXPLORER_AUTH_MODE##GOOGLE_OAUTH_CLIENT_ID=$GOOGLE_OAUTH_CLIENT_ID##ALLOWED_GOOGLE_DOMAINS=$ALLOWED_GOOGLE_DOMAINS##ALLOWED_GOOGLE_EMAILS=$ALLOWED_GOOGLE_EMAILS##CASE_EXPLORER_API_URL=$API_URL_VALUE##CASE_EXPLORER_API_AUDIENCE=$API_AUDIENCE_VALUE"

grant_service_invoker "$API_SERVICE_NAME" "serviceAccount:${CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL}"

echo "Case Explorer URL: $(case_explorer_url)"
