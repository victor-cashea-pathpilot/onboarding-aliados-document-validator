#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
gcloud_auth_healthcheck

echo "Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  iap.googleapis.com \
  cloudtasks.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  --project "$PROJECT_ID"

echo "Ensuring Firestore database exists..."
if ! gcloud firestore databases list --project "$PROJECT_ID" --format='value(name)' | grep -Fq "/databases/${FIRESTORE_DATABASE}"; then
  gcloud firestore databases create \
    --project "$PROJECT_ID" \
    --database="$FIRESTORE_DATABASE" \
    --location="$FIRESTORE_LOCATION"
else
  echo "Firestore database already exists."
fi

echo "Ensuring Artifact Registry exists..."
if ! gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
  --location="$REGION" \
  --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
    --project "$PROJECT_ID" \
    --location="$REGION" \
    --repository-format=docker \
    --description="Onboarding agent images"
else
  echo "Artifact Registry already exists."
fi

echo "Ensuring Cloud Tasks queue exists..."
if ! gcloud tasks queues describe "$CLOUD_TASKS_QUEUE_ID" \
  --location="$REGION" \
  --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud tasks queues create "$CLOUD_TASKS_QUEUE_ID" \
    --location="$REGION" \
    --project "$PROJECT_ID" \
    --max-dispatches-per-second="$CLOUD_TASKS_MAX_DISPATCHES_PER_SECOND" \
    --max-concurrent-dispatches="$CLOUD_TASKS_MAX_CONCURRENT_DISPATCHES" \
    --max-attempts="$CLOUD_TASKS_MAX_ATTEMPTS" \
    --max-retry-duration="${CLOUD_TASKS_MAX_RETRY_SECONDS}s"
else
  echo "Cloud Tasks queue already exists."
  gcloud tasks queues update "$CLOUD_TASKS_QUEUE_ID" \
    --location="$REGION" \
    --project "$PROJECT_ID" \
    --max-dispatches-per-second="$CLOUD_TASKS_MAX_DISPATCHES_PER_SECOND" \
    --max-concurrent-dispatches="$CLOUD_TASKS_MAX_CONCURRENT_DISPATCHES" \
    --max-attempts="$CLOUD_TASKS_MAX_ATTEMPTS" \
    --max-retry-duration="${CLOUD_TASKS_MAX_RETRY_SECONDS}s" >/dev/null
fi

echo "Ensuring dedicated service accounts exist..."
create_service_account_if_missing \
  "$API_RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  "Onboarding API Runtime"
create_service_account_if_missing \
  "$WORKER_RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  "Onboarding Worker Runtime"
create_service_account_if_missing \
  "$CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL" \
  "Onboarding Cloud Tasks Invoker"
if [[ -n "${CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL:-}" ]]; then
  create_service_account_if_missing \
    "$CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL" \
    "Onboarding Case Explorer Runtime"
fi

echo "Applying IAM bindings..."
grant_project_role "serviceAccount:${API_RUNTIME_SERVICE_ACCOUNT_EMAIL}" "roles/datastore.user"
grant_project_role "serviceAccount:${API_RUNTIME_SERVICE_ACCOUNT_EMAIL}" "roles/cloudtasks.enqueuer"
grant_project_role "serviceAccount:${WORKER_RUNTIME_SERVICE_ACCOUNT_EMAIL}" "roles/datastore.user"
grant_project_role "serviceAccount:${WORKER_RUNTIME_SERVICE_ACCOUNT_EMAIL}" "roles/aiplatform.user"
grant_service_account_actas \
  "$CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL" \
  "serviceAccount:${API_RUNTIME_SERVICE_ACCOUNT_EMAIL}"
grant_service_account_actas \
  "$CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL" \
  "serviceAccount:$(cloud_tasks_service_agent)"

if [[ "${CASE_EXPLORER_ENABLE_IAP:-false}" == "true" ]]; then
  gcloud beta services identity create \
    --service=iap.googleapis.com \
    --project="$PROJECT_ID" >/dev/null 2>&1 || true
fi

echo "Bootstrap complete."
