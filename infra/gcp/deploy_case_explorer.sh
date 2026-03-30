#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
require_case_explorer_env
gcloud_auth_healthcheck

API_URL_VALUE="${CASE_EXPLORER_API_URL:-$(api_url)}"
API_AUDIENCE_VALUE="${CASE_EXPLORER_API_AUDIENCE:-$API_URL_VALUE}"
IMAGE="$(case_explorer_image)"
PROJECT_NUMBER_VALUE="${PROJECT_NUMBER:-$(project_number)}"

echo "Building case explorer image: $IMAGE"
build_and_push_image "$ROOT_DIR/webapp/Dockerfile" "$IMAGE"

echo "Deploying case explorer webapp..."
DEPLOY_FLAGS=(
  --project "$PROJECT_ID"
  --region "$REGION"
  --platform managed
  --service-account "$CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL"
  --cpu "$CASE_EXPLORER_CPU"
  --memory "$CASE_EXPLORER_MEMORY"
  --timeout "$CASE_EXPLORER_TIMEOUT"
  --concurrency "$CASE_EXPLORER_CONCURRENCY"
  --min-instances "$CASE_EXPLORER_MIN_INSTANCES"
  --max-instances "$CASE_EXPLORER_MAX_INSTANCES"
  --image "$IMAGE"
  --set-env-vars "^##^ENVIRONMENT=$ENVIRONMENT##LOG_LEVEL=$LOG_LEVEL##WEBAPP_TITLE=Onboarding Case Explorer##WEBAPP_SESSION_SECRET=$WEBAPP_SESSION_SECRET##CASE_EXPLORER_AUTH_MODE=$CASE_EXPLORER_AUTH_MODE##GOOGLE_OAUTH_CLIENT_ID=$GOOGLE_OAUTH_CLIENT_ID##ALLOWED_GOOGLE_DOMAINS=$ALLOWED_GOOGLE_DOMAINS##ALLOWED_GOOGLE_EMAILS=$ALLOWED_GOOGLE_EMAILS##CASE_EXPLORER_API_URL=$API_URL_VALUE##CASE_EXPLORER_API_AUDIENCE=$API_AUDIENCE_VALUE"
)

if [[ "${CASE_EXPLORER_ENABLE_IAP}" == "true" ]]; then
  DEPLOY_FLAGS+=(--no-allow-unauthenticated)
else
  DEPLOY_FLAGS+=(--allow-unauthenticated)
fi

gcloud run deploy "$CASE_EXPLORER_SERVICE_NAME" "${DEPLOY_FLAGS[@]}"

grant_service_invoker "$API_SERVICE_NAME" "serviceAccount:${CASE_EXPLORER_RUNTIME_SERVICE_ACCOUNT_EMAIL}"

if [[ "${CASE_EXPLORER_ENABLE_IAP}" == "true" ]]; then
  echo "Enabling IAP on case explorer via Cloud Run API..."
  ACCESS_TOKEN="$(gcloud auth print-access-token)"
  RUN_SERVICE_NAME="projects/${PROJECT_ID}/locations/${REGION}/services/${CASE_EXPLORER_SERVICE_NAME}"
  OPERATION_NAME="$(
    curl -sS -X PATCH \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      "https://run.googleapis.com/v2/${RUN_SERVICE_NAME}?updateMask=iap_enabled" \
      -d '{"iapEnabled": true}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])'
  )"

  while true; do
    DONE_FLAG="$(
      curl -sS \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        "https://run.googleapis.com/v2/${OPERATION_NAME}" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("done", False)).lower())'
    )"
    [[ "$DONE_FLAG" == "true" ]] && break
    sleep 2
  done

  echo "Granting IAP service agent access to invoke the service..."
  grant_service_invoker "$CASE_EXPLORER_SERVICE_NAME" "serviceAccount:$(iap_service_agent)"

  if [[ -n "${CASE_EXPLORER_IAP_MEMBERS}" ]]; then
    IAP_POLICY_RESOURCE="https://iap.googleapis.com/v1/projects/${PROJECT_NUMBER_VALUE}/iap_web/cloud_run-${REGION}/services/${CASE_EXPLORER_SERVICE_NAME}"
    CURRENT_POLICY_FILE="$(mktemp)"
    UPDATED_POLICY_FILE="$(mktemp)"

    curl -sS -X POST \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      "${IAP_POLICY_RESOURCE}:getIamPolicy" >"$CURRENT_POLICY_FILE"

    python3 - "$CURRENT_POLICY_FILE" "$UPDATED_POLICY_FILE" "$CASE_EXPLORER_IAP_MEMBERS" <<'PY'
import json
import sys

current_path, output_path, members_csv = sys.argv[1:4]
members = [item.strip() for item in members_csv.split(",") if item.strip()]

with open(current_path, "r", encoding="utf-8") as fh:
    current = json.load(fh)

bindings = current.get("bindings", [])
role = "roles/iap.httpsResourceAccessor"
target = None
for binding in bindings:
    if binding.get("role") == role:
        target = binding
        break

if target is None:
    target = {"role": role, "members": []}
    bindings.append(target)

existing = set(target.get("members", []))
for member in members:
    existing.add(member)
target["members"] = sorted(existing)

payload = {
    "policy": {
        "etag": current.get("etag", ""),
        "version": current.get("version", 1),
        "bindings": bindings,
    }
}

with open(output_path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh)
PY

    curl -sS -X POST \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      "${IAP_POLICY_RESOURCE}:setIamPolicy" \
      -d @"$UPDATED_POLICY_FILE" >/dev/null

    rm -f "$CURRENT_POLICY_FILE" "$UPDATED_POLICY_FILE"
  else
    echo "WARNING: CASE_EXPLORER_IAP_MEMBERS is empty; no end-user principals were granted access."
  fi
fi

echo "Case Explorer URL: $(case_explorer_url)"
