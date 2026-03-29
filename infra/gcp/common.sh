#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

required_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

require_base_env() {
  required_env PROJECT_ID
  required_env REGION
  required_env FIRESTORE_LOCATION
  required_env FIRESTORE_DATABASE
  required_env FIRESTORE_COLLECTION
  required_env ARTIFACT_REPOSITORY
  required_env CLOUD_TASKS_QUEUE_ID
  required_env API_SERVICE_NAME
  required_env WORKER_SERVICE_NAME
  required_env API_RUNTIME_SERVICE_ACCOUNT_EMAIL
  required_env WORKER_RUNTIME_SERVICE_ACCOUNT_EMAIL
  required_env CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL
  required_env WORKER_AUTH_TOKEN
  required_env IMAGE_TAG
  : "${CLOUD_TASKS_MAX_DISPATCHES_PER_SECOND:=10}"
  : "${CLOUD_TASKS_MAX_CONCURRENT_DISPATCHES:=20}"
  : "${CLOUD_TASKS_MAX_ATTEMPTS:=5}"
  : "${CLOUD_TASKS_MAX_RETRY_SECONDS:=300}"
  : "${API_CPU:=1}"
  : "${API_MEMORY:=1Gi}"
  : "${API_TIMEOUT:=300}"
  : "${API_CONCURRENCY:=80}"
  : "${API_MIN_INSTANCES:=0}"
  : "${API_MAX_INSTANCES:=10}"
  : "${WORKER_CPU:=2}"
  : "${WORKER_MEMORY:=2Gi}"
  : "${WORKER_TIMEOUT:=900}"
  : "${WORKER_CONCURRENCY:=80}"
  : "${WORKER_MIN_INSTANCES:=0}"
  : "${WORKER_MAX_INSTANCES:=10}"
  : "${API_ALLOW_UNAUTHENTICATED:=false}"
  : "${OBSERVABILITY_DASHBOARD_NAME:=Onboarding Agent Overview}"
  : "${OBSERVABILITY_JOB_METRIC_PREFIX:=onboarding_job}"
  : "${OBSERVABILITY_LLM_METRIC_PREFIX:=onboarding_llm}"
  : "${OBSERVABILITY_EXTRACTION_METRIC_PREFIX:=onboarding_extraction}"
}

project_number() {
  gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)'
}

cloud_tasks_service_agent() {
  echo "service-$(project_number)@gcp-sa-cloudtasks.iam.gserviceaccount.com"
}

worker_image() {
  echo "${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/onboarding-worker:${IMAGE_TAG}"
}

api_image() {
  echo "${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/onboarding-api:${IMAGE_TAG}"
}

case_explorer_image() {
  echo "${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/onboarding-case-explorer:${IMAGE_TAG}"
}

worker_url() {
  gcloud run services describe "$WORKER_SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)'
}

api_url() {
  gcloud run services describe "$API_SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)'
}

case_explorer_url() {
  gcloud run services describe "$CASE_EXPLORER_SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)'
}

require_case_explorer_env() {
  required_env CASE_EXPLORER_SERVICE_NAME
  required_env CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL
  required_env WEBAPP_SESSION_SECRET
  : "${CASE_EXPLORER_AUTH_MODE:=disabled}"
  : "${CASE_EXPLORER_API_URL:=}"
  : "${CASE_EXPLORER_API_AUDIENCE:=}"
  : "${GOOGLE_OAUTH_CLIENT_ID:=}"
  : "${ALLOWED_GOOGLE_DOMAINS:=}"
  : "${ALLOWED_GOOGLE_EMAILS:=}"
  : "${CASE_EXPLORER_CPU:=1}"
  : "${CASE_EXPLORER_MEMORY:=1Gi}"
  : "${CASE_EXPLORER_TIMEOUT:=300}"
  : "${CASE_EXPLORER_CONCURRENCY:=40}"
  : "${CASE_EXPLORER_MIN_INSTANCES:=0}"
  : "${CASE_EXPLORER_MAX_INSTANCES:=5}"
}

configure_docker_auth() {
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
}

build_and_push_image() {
  local dockerfile="$1"
  local image="$2"

  configure_docker_auth
  docker buildx build \
    --platform linux/amd64 \
    -f "$dockerfile" \
    -t "$image" \
    --push \
    "$ROOT_DIR"
}

grant_project_role() {
  local member="$1"
  local role="$2"

  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="$member" \
    --role="$role" \
    --quiet >/dev/null
}

grant_service_invoker() {
  local service_name="$1"
  local member="$2"

  gcloud run services add-iam-policy-binding "$service_name" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --member="$member" \
    --role='roles/run.invoker' \
    --quiet >/dev/null
}

grant_service_account_actas() {
  local service_account_email="$1"
  local member="$2"

  gcloud iam service-accounts add-iam-policy-binding "$service_account_email" \
    --project "$PROJECT_ID" \
    --member="$member" \
    --role='roles/iam.serviceAccountUser' \
    --quiet >/dev/null
}

create_service_account_if_missing() {
  local email="$1"
  local display_name="$2"
  local account_id="${email%@*}"

  if ! gcloud iam service-accounts describe "$email" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$account_id" \
      --project "$PROJECT_ID" \
      --display-name "$display_name" >/dev/null
  fi
}

gcloud_auth_healthcheck() {
  gcloud auth print-access-token >/dev/null
  gcloud auth application-default print-access-token >/dev/null
}
