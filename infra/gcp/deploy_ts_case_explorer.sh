#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
require_case_explorer_env
gcloud_auth_healthcheck

IMAGE="$(ts_case_explorer_image)"
PROJECT_NUMBER_VALUE="${PROJECT_NUMBER:-$(project_number)}"
echo "Building TypeScript Case Explorer image: $IMAGE"
build_and_push_image "$ROOT_DIR/apps/case-explorer/Dockerfile" "$IMAGE"

ALLOW_FLAG="--no-allow-unauthenticated"
if [[ "${CASE_EXPLORER_ENABLE_IAP}" != "true" && "${TS_CASE_EXPLORER_ALLOW_UNAUTHENTICATED}" == "true" ]]; then
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

if [[ "${CASE_EXPLORER_ENABLE_IAP}" == "true" ]]; then
  echo "Enabling IAP on TypeScript case explorer via Cloud Run API..."
  ACCESS_TOKEN="$(gcloud auth print-access-token)"
  RUN_SERVICE_NAME="projects/${PROJECT_ID}/locations/${REGION}/services/${TS_CASE_EXPLORER_SERVICE_NAME}"
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

  echo "Granting IAP service agent access to invoke the TypeScript case explorer..."
  grant_service_invoker "$TS_CASE_EXPLORER_SERVICE_NAME" "serviceAccount:$(iap_service_agent)"

  if [[ -n "${CASE_EXPLORER_IAP_MEMBERS}" ]]; then
    OLD_IFS="$IFS"
    IFS=','
    read -r -a IAP_MEMBERS_ARRAY <<<"${CASE_EXPLORER_IAP_MEMBERS}"
    IFS="$OLD_IFS"
    for member in "${IAP_MEMBERS_ARRAY[@]}"; do
      member="$(echo "$member" | xargs)"
      [[ -z "$member" ]] && continue
      grant_service_invoker "$TS_CASE_EXPLORER_SERVICE_NAME" "$member"
    done

    IAP_POLICY_RESOURCE="https://iap.googleapis.com/v1/projects/${PROJECT_NUMBER_VALUE}/iap_web/cloud_run-${REGION}/services/${TS_CASE_EXPLORER_SERVICE_NAME}"
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

echo "TypeScript Case Explorer URL: $(ts_case_explorer_url)"
