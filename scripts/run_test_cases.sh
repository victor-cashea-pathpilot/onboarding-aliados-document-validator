#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/run_test_cases.sh
#
# Submits 3 validation test cases to the API and polls until completion,
# printing the confidence_breakdown from each result.
#
# Reads API_URL and API_KEY from .env (root of the repo).
# Usage:
#   ./scripts/run_test_cases.sh
#
# Prerequisites: curl, python3
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Load .env ────────────────────────────────────────────────────────────────
ENV_FILE="${REPO_ROOT}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

set -o allexport
# shellcheck disable=SC1090
source <(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$')
set +o allexport

API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:?API_KEY must be set in .env}"

# ── Colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

# ── Helpers ──────────────────────────────────────────────────────────────────
submit_job() {
  local payload="$1"
  curl -sS -X POST "${API_URL}/v1/onboarding/validate" \
    -H "X-Api-Key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

poll_job() {
  local job_id="$1"
  curl -sS -X POST "${API_URL}/v1/onboarding/status" \
    -H "X-Api-Key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"job_ids\": [\"${job_id}\"]}"
}

extract_field() {
  # Usage: extract_field <json> <python-expression>
  python3 -c "import json,sys; d=json.loads(sys.argv[1]); print($2)" "$1" 2>/dev/null || echo "n/a"
}

wait_for_completion() {
  local job_id="$1"
  local label="$2"
  local max_attempts=40
  local attempt=0

  while [[ $attempt -lt $max_attempts ]]; do
    local resp
    resp="$(poll_job "$job_id")"
    local status
    status="$(extract_field "$resp" 'd[0]["status"]')"

    printf "\r  ${CYAN}[%s]${RESET} status: %-12s (attempt %d/%d)" \
      "$label" "$status" "$((attempt + 1))" "$max_attempts"

    if [[ "$status" == "COMPLETED" || "$status" == "FAILED" ]]; then
      echo
      echo "$resp"
      return 0
    fi

    sleep 5
    (( attempt++ )) || true
  done

  echo
  echo "  Timed out waiting for ${job_id}" >&2
  return 1
}

print_result() {
  local label="$1"
  local resp="$2"

  local verdict confidence llm doc composite
  verdict="$(extract_field "$resp"   'd[0]["overall_result"]["status"]')"
  confidence="$(extract_field "$resp" 'd[0]["overall_result"]["confidence"]')"
  llm="$(extract_field "$resp"       'd[0]["overall_result"].get("confidence_breakdown",{}).get("llm_assessment","—")')"
  doc="$(extract_field "$resp"       'd[0]["overall_result"].get("confidence_breakdown",{}).get("document_quality","—")')"
  composite="$(extract_field "$resp" 'd[0]["overall_result"].get("confidence_breakdown",{}).get("composite","—")')"

  echo
  echo -e "  ${BOLD}${label}${RESET}"
  echo -e "  Verdict   : ${BOLD}${verdict}${RESET}"
  echo -e "  Confidence: ${confidence}"
  echo -e "  ┌─ confidence_breakdown ──────────────────┐"
  echo -e "  │  llm_assessment  : ${llm}"
  echo -e "  │  document_quality: ${doc}"
  echo -e "  │  composite       : ${composite}"
  echo -e "  └────────────────────────────────────────┘"
}

# ── Document URLs ─────────────────────────────────────────────────────────────
# Using publicly accessible dummy PDFs. Replace with real test documents for
# more meaningful legibility scores.
PDF_URL="https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
IMG_URL="https://httpbin.org/image/jpeg"

echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}  Cashea LDV — Test Cases (confidence_breakdown check)${RESET}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}"
echo -e "  API: ${API_URL}"
echo

# ── Case 1: Sociedad Mercantil ───────────────────────────────────────────────
echo -e "${BOLD}Case 1 — Sociedad Mercantil${RESET}  (RIF + cédula + acta_constitutiva + acta_mercantil)"

RESP1="$(submit_job '{
  "merchant_id": "test-sociedad-mercantil-001",
  "request_id": "tc-sm-001",
  "documents": {
    "rif":                        [{"url": "'"$PDF_URL"'", "document_id": "rif-1"}],
    "cedula":                     [{"url": "'"$IMG_URL"'", "document_id": "ced-1"}],
    "acta_constitutiva":          [{"url": "'"$PDF_URL"'", "document_id": "acta-1"}],
    "acta_mercantil":             [{"url": "'"$PDF_URL"'", "document_id": "merc-1"}],
    "certificado_emprendimiento": []
  }
}')"

JOB1="$(extract_field "$RESP1" 'd["job_id"]')"
echo "  Submitted → job_id: ${JOB1}"
RESULT1="$(wait_for_completion "$JOB1" "Case 1")"
print_result "Case 1 — Sociedad Mercantil" "$RESULT1"

echo
echo -e "${CYAN}───────────────────────────────────────────────────────────${RESET}"
echo

# ── Case 2: Emprendimiento ───────────────────────────────────────────────────
echo -e "${BOLD}Case 2 — Emprendimiento${RESET}  (RIF + cédula + certificado_emprendimiento)"

RESP2="$(submit_job '{
  "merchant_id": "test-emprendimiento-002",
  "request_id": "tc-emp-002",
  "documents": {
    "rif":                        [{"url": "'"$PDF_URL"'", "document_id": "rif-1"}],
    "cedula":                     [{"url": "'"$IMG_URL"'", "document_id": "ced-1"}],
    "acta_constitutiva":          [],
    "acta_mercantil":             [],
    "certificado_emprendimiento": [{"url": "'"$PDF_URL"'", "document_id": "cert-1"}]
  }
}')"

JOB2="$(extract_field "$RESP2" 'd["job_id"]')"
echo "  Submitted → job_id: ${JOB2}"
RESULT2="$(wait_for_completion "$JOB2" "Case 2")"
print_result "Case 2 — Emprendimiento" "$RESULT2"

echo
echo -e "${CYAN}───────────────────────────────────────────────────────────${RESET}"
echo

# ── Case 3: Firma Personal ───────────────────────────────────────────────────
echo -e "${BOLD}Case 3 — Firma Personal${RESET}  (RIF + cédula only)"

RESP3="$(submit_job '{
  "merchant_id": "test-firma-personal-003",
  "request_id": "tc-fp-003",
  "documents": {
    "rif":                        [{"url": "'"$PDF_URL"'", "document_id": "rif-1"}],
    "cedula":                     [{"url": "'"$IMG_URL"'", "document_id": "ced-1"}],
    "acta_constitutiva":          [],
    "acta_mercantil":             [],
    "certificado_emprendimiento": []
  }
}')"

JOB3="$(extract_field "$RESP3" 'd["job_id"]')"
echo "  Submitted → job_id: ${JOB3}"
RESULT3="$(wait_for_completion "$JOB3" "Case 3")"
print_result "Case 3 — Firma Personal" "$RESULT3"

echo
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Done. Check confidence_breakdown above for legibility data.${RESET}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}"
echo
