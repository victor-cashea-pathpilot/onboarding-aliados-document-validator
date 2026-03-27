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
  : "${API_ALLOW_UNAUTHENTICATED:=false}"
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
