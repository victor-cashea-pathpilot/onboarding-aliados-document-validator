#!/usr/bin/env bash

set -euo pipefail

SERVICE_KEY="${1:?Usage: deploy_cloud_run_service.sh <service-key> <image-tag> <env-vars-file> [config-file]}"
IMAGE_TAG="${2:?Usage: deploy_cloud_run_service.sh <service-key> <image-tag> <env-vars-file> [config-file]}"
ENV_VARS_FILE="${3:?Usage: deploy_cloud_run_service.sh <service-key> <image-tag> <env-vars-file> [config-file]}"
CONFIG_FILE="${4:-infra/cicd/deploy-config.dev.yaml}"

read_config() {
  local path="$1"
  yq -r "$path // \"\"" "$CONFIG_FILE"
}

PROJECT_ID="${GCP_PROJECT_ID:-$(read_config '.environment.project_id')}"
REGION="${GCP_REGION:-$(read_config '.environment.region')}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-$(read_config '.environment.artifact_repository')}"
NETWORK="$(read_config '.environment.network')"
SUBNET="$(read_config '.environment.subnet')"
SERVICE_NAME="$(read_config ".services.${SERVICE_KEY}.service_name")"
IMAGE_NAME="$(read_config ".services.${SERVICE_KEY}.image_name")"
RUNTIME_SERVICE_ACCOUNT="$(read_config ".services.${SERVICE_KEY}.runtime_service_account")"
CPU="$(read_config ".services.${SERVICE_KEY}.cpu")"
PORT="$(read_config ".services.${SERVICE_KEY}.port")"
MEMORY="$(read_config ".services.${SERVICE_KEY}.memory")"
MIN_INSTANCES="$(read_config ".services.${SERVICE_KEY}.min_instances")"
MAX_INSTANCES="$(read_config ".services.${SERVICE_KEY}.max_instances")"
CONCURRENCY="$(read_config ".services.${SERVICE_KEY}.max_requests_per_instance")"
ALLOW_UNAUTHENTICATED="$(read_config ".services.${SERVICE_KEY}.allow_unauthenticated")"
USE_HTTP2="$(read_config ".services.${SERVICE_KEY}.use_http2")"
INGRESS="$(read_config ".services.${SERVICE_KEY}.ingress")"
VPC_EGRESS="$(read_config ".services.${SERVICE_KEY}.vpc_egress")"

if [[ -z "$SERVICE_NAME" || -z "$IMAGE_NAME" || -z "$RUNTIME_SERVICE_ACCOUNT" ]]; then
  echo "Unknown service key '${SERVICE_KEY}' in ${CONFIG_FILE}" >&2
  exit 1
fi

FULL_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"
AUTH_FLAG="--no-allow-unauthenticated"
HTTP2_FLAG=""
SET_SECRETS_FLAG=""

if [[ "$ALLOW_UNAUTHENTICATED" == "true" ]]; then
  AUTH_FLAG="--allow-unauthenticated"
fi

if [[ "$USE_HTTP2" == "true" ]]; then
  HTTP2_FLAG="--use-http2"
fi

# Build --set-secrets from the secrets section in deploy config.
# Each entry maps an env var name to a Secret Manager secret ref (name:version).
SECRETS_LIST="$(
  yq -r "
    .services.${SERVICE_KEY}.secrets
    | to_entries
    | .[]
    | .key + \"=\" + .value
  " "$CONFIG_FILE" 2>/dev/null || true
)"

if [[ -n "$SECRETS_LIST" ]]; then
  JOINED_SECRETS="$(echo "$SECRETS_LIST" | paste -sd ',' -)"
  SET_SECRETS_FLAG="--set-secrets=${JOINED_SECRETS}"
fi

echo "Deploying ${SERVICE_KEY} to Cloud Run service ${SERVICE_NAME}"
gcloud run deploy "$SERVICE_NAME" \
  --image "$FULL_IMAGE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --cpu "$CPU" \
  --port "$PORT" \
  --memory "$MEMORY" \
  --min-instances "$MIN_INSTANCES" \
  --max-instances "$MAX_INSTANCES" \
  --concurrency "$CONCURRENCY" \
  --ingress "$INGRESS" \
  --network "$NETWORK" \
  --subnet "$SUBNET" \
  --vpc-egress "$VPC_EGRESS" \
  --execution-environment gen2 \
  --env-vars-file "$ENV_VARS_FILE" \
  ${AUTH_FLAG} \
  ${HTTP2_FLAG} \
  ${SET_SECRETS_FLAG}
