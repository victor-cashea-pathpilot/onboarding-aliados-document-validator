#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env

API_URL="$(api_url)"
TOKEN="$(gcloud auth print-identity-token)"

echo "Checking API health..."
curl -sS -H "Authorization: Bearer ${TOKEN}" "${API_URL}/health"
echo

echo "Submitting smoke-test job..."
SUBMIT_RESPONSE="$(
  curl -sS -X POST "${API_URL}/v1/onboarding/validate" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"merchant_id\": \"smoke-test-merchant\",
      \"request_id\": \"smoke-test-$(date +%s)\",
      \"documents\": {
        \"rif\": [{\"url\": \"${SMOKE_TEST_PDF_URL}\", \"document_id\": \"rif-1\"}],
        \"cedula\": [{\"url\": \"${SMOKE_TEST_IMAGE_URL}\", \"document_id\": \"ced-1\"}],
        \"certificado_emprendimiento\": [],
        \"acta_constitutiva\": [{\"url\": \"${SMOKE_TEST_PDF_URL}\", \"document_id\": \"acta-1\"}],
        \"acta_mercantil\": []
      }
    }"
)"

echo "$SUBMIT_RESPONSE"

JOB_ID="$(
  python3 - <<'PY' "$SUBMIT_RESPONSE"
import json
import sys
print(json.loads(sys.argv[1])["job_id"])
PY
)"

echo "Polling status for job: $JOB_ID"
for _ in 1 2 3 4 5 6 7 8; do
  STATUS_RESPONSE="$(
    curl -sS -X POST "${API_URL}/v1/onboarding/status" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"job_ids\": [\"${JOB_ID}\"]}"
  )"
  echo "$STATUS_RESPONSE"

  CURRENT_STATUS="$(
    python3 - <<'PY' "$STATUS_RESPONSE"
import json
import sys
payload = json.loads(sys.argv[1])
print(payload[0]["status"])
PY
  )"

  if [[ "$CURRENT_STATUS" == "COMPLETED" || "$CURRENT_STATUS" == "FAILED" ]]; then
    exit 0
  fi

  sleep 3
done

echo "Smoke test timed out before completion." >&2
exit 1
