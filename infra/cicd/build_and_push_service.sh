#!/usr/bin/env bash

set -euo pipefail

SERVICE_KEY="${1:?Usage: build_and_push_service.sh <service-key> <image-tag> [config-file]}"
IMAGE_TAG="${2:?Usage: build_and_push_service.sh <service-key> <image-tag> [config-file]}"
CONFIG_FILE="${3:-infra/cicd/deploy-config.dev.yaml}"

read_config() {
  local path="$1"
  yq -r "$path // \"\"" "$CONFIG_FILE"
}

PROJECT_ID="${GCP_PROJECT_ID:-$(read_config '.environment.project_id')}"
REGION="${GCP_REGION:-$(read_config '.environment.region')}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-$(read_config '.environment.artifact_repository')}"
IMAGE_NAME="$(read_config ".services.${SERVICE_KEY}.image_name")"
DOCKERFILE_PATH="$(read_config ".services.${SERVICE_KEY}.dockerfile")"

if [[ -z "$IMAGE_NAME" || -z "$DOCKERFILE_PATH" ]]; then
  echo "Unknown service key '${SERVICE_KEY}' in ${CONFIG_FILE}" >&2
  exit 1
fi

FULL_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building ${SERVICE_KEY} image: ${FULL_IMAGE}"
docker build -f "$DOCKERFILE_PATH" -t "$FULL_IMAGE" .
docker push "$FULL_IMAGE"

echo "$FULL_IMAGE"
