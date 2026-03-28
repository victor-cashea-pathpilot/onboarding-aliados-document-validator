#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
gcloud_auth_healthcheck

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

apply_log_metric() {
  local metric_name="$1"
  local config_file="$2"

  if gcloud logging metrics describe "$metric_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud logging metrics update "$metric_name" \
      --project "$PROJECT_ID" \
      --config-from-file="$config_file" >/dev/null
    echo "Updated log metric: $metric_name"
  else
    gcloud logging metrics create "$metric_name" \
      --project "$PROJECT_ID" \
      --config-from-file="$config_file" >/dev/null
    echo "Created log metric: $metric_name"
  fi
}

write_counter_metric_config() {
  local path="$1"
  local description="$2"
  local filter="$3"

  cat >"$path" <<EOF
description: "$description"
filter: '$filter'
EOF
}

write_distribution_metric_config() {
  local path="$1"
  local description="$2"
  local filter="$3"
  local value_extractor="$4"

  cat >"$path" <<EOF
description: "$description"
filter: '$filter'
metricDescriptor:
  metricKind: DELTA
  valueType: DISTRIBUTION
  unit: "ms"
valueExtractor: '$value_extractor'
bucketOptions:
  exponentialBuckets:
    numFiniteBuckets: 16
    growthFactor: 2
    scale: 10
EOF
}

JOB_PREFIX="${OBSERVABILITY_JOB_METRIC_PREFIX}"
LLM_PREFIX="${OBSERVABILITY_LLM_METRIC_PREFIX}"
EXTRACTION_PREFIX="${OBSERVABILITY_EXTRACTION_METRIC_PREFIX}"

write_counter_metric_config \
  "$TMP_DIR/${JOB_PREFIX}_submitted_count.yaml" \
  "Count of validation jobs accepted by the API." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="api.validation.submit.accepted"'
apply_log_metric "${JOB_PREFIX}_submitted_count" "$TMP_DIR/${JOB_PREFIX}_submitted_count.yaml"

write_counter_metric_config \
  "$TMP_DIR/${JOB_PREFIX}_completed_count.yaml" \
  "Count of validation jobs completed by the worker." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="job.completed"'
apply_log_metric "${JOB_PREFIX}_completed_count" "$TMP_DIR/${JOB_PREFIX}_completed_count.yaml"

write_counter_metric_config \
  "$TMP_DIR/${JOB_PREFIX}_failed_count.yaml" \
  "Count of validation jobs that failed during processing." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="job.failed"'
apply_log_metric "${JOB_PREFIX}_failed_count" "$TMP_DIR/${JOB_PREFIX}_failed_count.yaml"

write_counter_metric_config \
  "$TMP_DIR/${JOB_PREFIX}_approved_count.yaml" \
  "Count of jobs whose final overall result is APPROVED." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="job.completed" AND jsonPayload.overall_status="APPROVED"'
apply_log_metric "${JOB_PREFIX}_approved_count" "$TMP_DIR/${JOB_PREFIX}_approved_count.yaml"

write_counter_metric_config \
  "$TMP_DIR/${JOB_PREFIX}_review_count.yaml" \
  "Count of jobs whose final overall result is REQUIRES_REVIEW." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="job.completed" AND jsonPayload.overall_status="REQUIRES_REVIEW"'
apply_log_metric "${JOB_PREFIX}_review_count" "$TMP_DIR/${JOB_PREFIX}_review_count.yaml"

write_counter_metric_config \
  "$TMP_DIR/${JOB_PREFIX}_rejected_count.yaml" \
  "Count of jobs whose final overall result is REJECTED." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="job.completed" AND jsonPayload.overall_status="REJECTED"'
apply_log_metric "${JOB_PREFIX}_rejected_count" "$TMP_DIR/${JOB_PREFIX}_rejected_count.yaml"

write_distribution_metric_config \
  "$TMP_DIR/${JOB_PREFIX}_duration_ms.yaml" \
  "Distribution of end-to-end job duration in milliseconds." \
  'resource.type="cloud_run_revision" AND (jsonPayload.event="job.completed" OR jsonPayload.event="job.failed")' \
  'EXTRACT(jsonPayload.duration_ms)'
apply_log_metric "${JOB_PREFIX}_duration_ms" "$TMP_DIR/${JOB_PREFIX}_duration_ms.yaml"

write_counter_metric_config \
  "$TMP_DIR/${EXTRACTION_PREFIX}_failed_count.yaml" \
  "Count of document extraction failures." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="document.extraction.failed"'
apply_log_metric "${EXTRACTION_PREFIX}_failed_count" "$TMP_DIR/${EXTRACTION_PREFIX}_failed_count.yaml"

write_counter_metric_config \
  "$TMP_DIR/${LLM_PREFIX}_call_count.yaml" \
  "Count of successful LLM calls across extraction and validation." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="llm.request.completed"'
apply_log_metric "${LLM_PREFIX}_call_count" "$TMP_DIR/${LLM_PREFIX}_call_count.yaml"

write_counter_metric_config \
  "$TMP_DIR/${LLM_PREFIX}_error_count.yaml" \
  "Count of failed LLM calls." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="llm.request.failed"'
apply_log_metric "${LLM_PREFIX}_error_count" "$TMP_DIR/${LLM_PREFIX}_error_count.yaml"

write_distribution_metric_config \
  "$TMP_DIR/${LLM_PREFIX}_duration_ms.yaml" \
  "Distribution of LLM call duration in milliseconds." \
  'resource.type="cloud_run_revision" AND jsonPayload.event="llm.request.completed"' \
  'EXTRACT(jsonPayload.duration_ms)'
apply_log_metric "${LLM_PREFIX}_duration_ms" "$TMP_DIR/${LLM_PREFIX}_duration_ms.yaml"

echo "Log metrics are up to date."
