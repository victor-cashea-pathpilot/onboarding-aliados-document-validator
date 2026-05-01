#!/usr/bin/env bash

set -euo pipefail

SERVICE_KEY="${1:?Usage: render_cloud_run_env.sh <service-key> <output-file> [config-file]}"
OUTPUT_FILE="${2:?Usage: render_cloud_run_env.sh <service-key> <output-file> [config-file]}"
CONFIG_FILE="${3:-infra/cicd/deploy-config.dev.yaml}"

read_config() {
  local path="$1"
  yq -r "$path // \"\"" "$CONFIG_FILE"
}

require_value() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Missing required value: $name" >&2
    exit 1
  fi
}

yaml_quote() {
  jq -Rn --arg value "$1" '$value'
}

append_pair() {
  local key="$1"
  local value="$2"
  printf '%s: %s\n' "$key" "$(yaml_quote "$value")" >>"$OUTPUT_FILE"
}

PROJECT_ID="${GCP_PROJECT_ID:-$(read_config '.environment.project_id')}"
REGION="${GCP_REGION:-$(read_config '.environment.region')}"
FIRESTORE_DATABASE="${FIRESTORE_DATABASE:-$(read_config '.environment.firestore_database')}"
FIRESTORE_COLLECTION="${FIRESTORE_COLLECTION:-$(read_config '.environment.firestore_collection')}"
CLOUD_TASKS_QUEUE_ID="${CLOUD_TASKS_QUEUE_ID:-$(read_config '.environment.cloud_tasks_queue_id')}"
WORKER_SERVICE_NAME="$(read_config '.services.worker.service_name')"
WORKER_BASE_URL_OVERRIDE="${WORKER_BASE_URL:-}"
WORKER_AUDIENCE_OVERRIDE="${WORKER_AUDIENCE:-}"
WORKER_BASE_URL_CURRENT=""

require_value "GCP_PROJECT_ID" "$PROJECT_ID"
require_value "GCP_REGION" "$REGION"
require_value "FIRESTORE_DATABASE" "$FIRESTORE_DATABASE"
require_value "FIRESTORE_COLLECTION" "$FIRESTORE_COLLECTION"

if [[ -n "$WORKER_SERVICE_NAME" ]]; then
  WORKER_BASE_URL_CURRENT="$(
    gcloud run services describe "$WORKER_SERVICE_NAME" \
      --project "$PROJECT_ID" \
      --region "$REGION" \
      --format='value(status.url)' 2>/dev/null || true
  )"
fi

WORKER_BASE_URL_RESOLVED="${WORKER_BASE_URL_OVERRIDE:-$WORKER_BASE_URL_CURRENT}"
WORKER_AUDIENCE_RESOLVED="${WORKER_AUDIENCE_OVERRIDE:-$WORKER_BASE_URL_RESOLVED}"

mkdir -p "$(dirname "$OUTPUT_FILE")"
: >"$OUTPUT_FILE"

append_pair "ENVIRONMENT" "${ENVIRONMENT:-development}"
append_pair "LOG_LEVEL" "${LOG_LEVEL:-INFO}"
append_pair "GCP_PROJECT_ID" "$PROJECT_ID"
append_pair "GCP_REGION" "$REGION"
append_pair "FIRESTORE_DATABASE" "$FIRESTORE_DATABASE"
append_pair "FIRESTORE_COLLECTION" "$FIRESTORE_COLLECTION"
append_pair "MOCK_MODE" "${MOCK_MODE:-false}"
append_pair "DOWNLOAD_TIMEOUT_SECONDS" "${DOWNLOAD_TIMEOUT_SECONDS:-20}"
append_pair "MAX_DOCUMENT_SIZE_BYTES" "${MAX_DOCUMENT_SIZE_BYTES:-15728640}"
append_pair "MAX_EXTRACTION_CONCURRENCY" "${MAX_EXTRACTION_CONCURRENCY:-4}"
append_pair "GEMINI_LOCATION" "${GEMINI_LOCATION:-global}"
append_pair "GEMINI_MODEL_SIMPLE" "${GEMINI_MODEL_SIMPLE:-gemini-2.5-flash}"
append_pair "GEMINI_MODEL_COMPLEX" "${GEMINI_MODEL_COMPLEX:-gemini-2.5-pro}"
append_pair "ENABLE_LLM_CROSS_VALIDATION" "${ENABLE_LLM_CROSS_VALIDATION:-true}"
append_pair "ENABLE_LLM_LEGAL_ASSESSMENT" "${ENABLE_LLM_LEGAL_ASSESSMENT:-true}"

if [[ "$SERVICE_KEY" == "api" || "$SERVICE_KEY" == "grpc" ]]; then
  CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL="$(
    read_config ".services.${SERVICE_KEY}.cloud_tasks_service_account_email"
  )"
  require_value "CLOUD_TASKS_QUEUE_ID" "$CLOUD_TASKS_QUEUE_ID"
  require_value "CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL" "$CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL"
  require_value "WORKER_AUTH_TOKEN" "${WORKER_AUTH_TOKEN:-}"
  require_value "WORKER_BASE_URL" "$WORKER_BASE_URL_RESOLVED"

  append_pair "JOB_REPOSITORY_MODE" "firestore"
  append_pair "JOB_QUEUE_MODE" "cloud_tasks"
  append_pair "CLOUD_TASKS_QUEUE_ID" "$CLOUD_TASKS_QUEUE_ID"
  append_pair "CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL" "$CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL"
  append_pair "WORKER_BASE_URL" "$WORKER_BASE_URL_RESOLVED"
  append_pair "WORKER_AUDIENCE" "$WORKER_AUDIENCE_RESOLVED"
  append_pair "WORKER_AUTH_TOKEN" "${WORKER_AUTH_TOKEN}"
fi

if [[ "$SERVICE_KEY" == "worker" ]]; then
  require_value "WORKER_AUTH_TOKEN" "${WORKER_AUTH_TOKEN:-}"
  append_pair "WORKER_AUTH_TOKEN" "${WORKER_AUTH_TOKEN}"
fi

if [[ "$SERVICE_KEY" == "explorer" ]]; then
  require_value "WEBAPP_SESSION_SECRET" "${WEBAPP_SESSION_SECRET:-}"
  require_value "CASE_EXPLORER_API_URL" "${CASE_EXPLORER_API_URL:-}"
  append_pair "WEBAPP_SESSION_SECRET" "${WEBAPP_SESSION_SECRET}"
  append_pair "CASE_EXPLORER_API_URL" "${CASE_EXPLORER_API_URL}"
  append_pair "CASE_EXPLORER_API_AUDIENCE" "${CASE_EXPLORER_API_AUDIENCE:-${CASE_EXPLORER_API_URL}}"
fi

while IFS= read -r key; do
  [[ -z "$key" ]] && continue
  value="$(read_config ".services.${SERVICE_KEY}.env.${key}")"
  append_pair "$key" "$value"
done < <(yq -r ".services.${SERVICE_KEY}.env | keys | .[]" "$CONFIG_FILE" 2>/dev/null || true)
