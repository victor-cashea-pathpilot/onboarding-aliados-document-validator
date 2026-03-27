#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_base_env
gcloud_auth_healthcheck

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

JOB_PREFIX="${OBSERVABILITY_JOB_METRIC_PREFIX}"
LLM_PREFIX="${OBSERVABILITY_LLM_METRIC_PREFIX}"
EXTRACTION_PREFIX="${OBSERVABILITY_EXTRACTION_METRIC_PREFIX}"
DASHBOARD_DISPLAY_NAME="${OBSERVABILITY_DASHBOARD_NAME}"

EXISTING_DASHBOARDS="$TMP_DIR/dashboards.json"
export EXISTING_DASHBOARDS
export OBSERVABILITY_DASHBOARD_NAME OBSERVABILITY_JOB_METRIC_PREFIX OBSERVABILITY_LLM_METRIC_PREFIX OBSERVABILITY_EXTRACTION_METRIC_PREFIX
gcloud monitoring dashboards list \
  --project "$PROJECT_ID" \
  --format=json >"$EXISTING_DASHBOARDS"

python3 - <<'PY' >"$TMP_DIR/dashboard.json"
import json
import os

project_id = os.environ["PROJECT_ID"]
dashboard_name = os.environ["OBSERVABILITY_DASHBOARD_NAME"]
job_prefix = os.environ["OBSERVABILITY_JOB_METRIC_PREFIX"]
llm_prefix = os.environ["OBSERVABILITY_LLM_METRIC_PREFIX"]
extraction_prefix = os.environ["OBSERVABILITY_EXTRACTION_METRIC_PREFIX"]
api_service = os.environ["API_SERVICE_NAME"]
worker_service = os.environ["WORKER_SERVICE_NAME"]
existing_dashboards_path = os.environ["EXISTING_DASHBOARDS"]

with open(existing_dashboards_path, "r", encoding="utf-8") as fh:
    dashboards = json.load(fh)

existing = next((item for item in dashboards if item.get("displayName") == dashboard_name), None)


def metric_filter(metric_type: str, extra: str = "") -> str:
    base = f'metric.type="{metric_type}"'
    return f"{base} {extra}".strip()


def logs_metric(metric_name: str) -> str:
    return f'logging.googleapis.com/user/{metric_name}'


def xychart_widget(title: str, datasets: list[dict], y_axis_label: str) -> dict:
    return {
        "title": title,
        "xyChart": {
            "dataSets": datasets,
            "timeshiftDuration": "0s",
            "yAxis": {
                "label": y_axis_label,
                "scale": "LINEAR",
            },
        },
    }


def ts_dataset(metric_type: str, legend: str, *, aligner: str = "ALIGN_SUM", reducer: str = "REDUCE_SUM", filter_suffix: str = "", plot_type: str = "LINE", group_by: list[str] | None = None) -> dict:
    aggregation = {
        "alignmentPeriod": "300s",
        "perSeriesAligner": aligner,
        "crossSeriesReducer": reducer,
        "groupByFields": group_by or [],
    }
    return {
        "timeSeriesQuery": {
            "timeSeriesFilter": {
                "filter": metric_filter(metric_type, filter_suffix),
                "aggregation": aggregation,
            }
        },
        "plotType": plot_type,
        "legendTemplate": legend,
        "targetAxis": "Y1",
    }


widgets = [
    {
        "title": "Arquitectura actual",
        "text": {
            "format": "MARKDOWN",
            "content": (
                "Este dashboard visualiza el flujo `API -> Cloud Tasks -> Worker -> Firestore -> Gemini` "
                "a partir de logs estructurados y métricas de Cloud Run."
            ),
        },
    },
    xychart_widget(
        "Jobs submit/completed/failed",
        [
            ts_dataset(logs_metric(f"{job_prefix}_submitted_count"), "submitted"),
            ts_dataset(logs_metric(f"{job_prefix}_completed_count"), "completed"),
            ts_dataset(logs_metric(f"{job_prefix}_failed_count"), "failed"),
        ],
        "jobs / 5m",
    ),
    xychart_widget(
        "Final outcomes",
        [
            ts_dataset(logs_metric(f"{job_prefix}_approved_count"), "approved"),
            ts_dataset(logs_metric(f"{job_prefix}_review_count"), "requires_review"),
            ts_dataset(logs_metric(f"{job_prefix}_rejected_count"), "rejected"),
        ],
        "jobs / 5m",
    ),
    xychart_widget(
        "Job duration (p50/p95)",
        [
            ts_dataset(logs_metric(f"{job_prefix}_duration_ms"), "p50", aligner="ALIGN_PERCENTILE_50", reducer="REDUCE_NONE"),
            ts_dataset(logs_metric(f"{job_prefix}_duration_ms"), "p95", aligner="ALIGN_PERCENTILE_95", reducer="REDUCE_NONE"),
        ],
        "ms",
    ),
    xychart_widget(
        "LLM calls and errors",
        [
            ts_dataset(logs_metric(f"{llm_prefix}_call_count"), "llm_calls"),
            ts_dataset(logs_metric(f"{llm_prefix}_error_count"), "llm_errors"),
            ts_dataset(logs_metric(f"{extraction_prefix}_failed_count"), "extraction_failures"),
        ],
        "events / 5m",
    ),
    xychart_widget(
        "LLM duration (p50/p95)",
        [
            ts_dataset(logs_metric(f"{llm_prefix}_duration_ms"), "p50", aligner="ALIGN_PERCENTILE_50", reducer="REDUCE_NONE"),
            ts_dataset(logs_metric(f"{llm_prefix}_duration_ms"), "p95", aligner="ALIGN_PERCENTILE_95", reducer="REDUCE_NONE"),
        ],
        "ms",
    ),
    xychart_widget(
        "Cloud Run request count",
        [
            ts_dataset(
                "run.googleapis.com/request_count",
                f"{api_service}",
                filter_suffix=f'resource.type="cloud_run_revision" AND resource.labels.service_name="{api_service}"',
            ),
            ts_dataset(
                "run.googleapis.com/request_count",
                f"{worker_service}",
                filter_suffix=f'resource.type="cloud_run_revision" AND resource.labels.service_name="{worker_service}"',
            ),
        ],
        "requests / 5m",
    ),
    xychart_widget(
        "Cloud Run request latency (p95)",
        [
            ts_dataset(
                "run.googleapis.com/request_latencies",
                f"{api_service}",
                aligner="ALIGN_PERCENTILE_95",
                reducer="REDUCE_NONE",
                filter_suffix=f'resource.type="cloud_run_revision" AND resource.labels.service_name="{api_service}"',
            ),
            ts_dataset(
                "run.googleapis.com/request_latencies",
                f"{worker_service}",
                aligner="ALIGN_PERCENTILE_95",
                reducer="REDUCE_NONE",
                filter_suffix=f'resource.type="cloud_run_revision" AND resource.labels.service_name="{worker_service}"',
            ),
        ],
        "ms",
    ),
]

tiles = []
y = 0
for index, widget in enumerate(widgets):
    width = 12 if index == 0 else 6
    height = 3 if index == 0 else 4
    x = 0 if width == 12 or index % 2 == 1 else 6
    if width == 12:
        x = 0
    elif index % 2 == 1:
        x = 0
    else:
        x = 6
    tiles.append(
        {
            "xPos": x,
            "yPos": y,
            "width": width,
            "height": height,
            "widget": widget,
        }
    )
    if width == 12 or x == 6:
        y += height

dashboard = {
    "displayName": dashboard_name,
    "mosaicLayout": {
        "columns": 12,
        "tiles": tiles,
    },
}

if existing:
    dashboard["name"] = existing["name"]
    if "etag" in existing:
        dashboard["etag"] = existing["etag"]

print(json.dumps(dashboard, ensure_ascii=False, indent=2))
PY

DASHBOARD_ID="$(
  python3 - <<'PY'
import json
import os

dashboard_name = os.environ["OBSERVABILITY_DASHBOARD_NAME"]
with open(os.environ["EXISTING_DASHBOARDS"], "r", encoding="utf-8") as fh:
    dashboards = json.load(fh)

for item in dashboards:
    if item.get("displayName") == dashboard_name:
        print(item["name"].split("/")[-1])
        break
PY
)"

if [[ -n "${DASHBOARD_ID}" ]]; then
  gcloud monitoring dashboards update "$DASHBOARD_ID" \
    --project "$PROJECT_ID" \
    --config-from-file="$TMP_DIR/dashboard.json" >/dev/null
  echo "Updated dashboard: $DASHBOARD_DISPLAY_NAME"
else
  gcloud monitoring dashboards create \
    --project "$PROJECT_ID" \
    --config-from-file="$TMP_DIR/dashboard.json" >/dev/null
  echo "Created dashboard: $DASHBOARD_DISPLAY_NAME"
fi
