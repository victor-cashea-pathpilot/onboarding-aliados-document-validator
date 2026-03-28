#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bash "$SCRIPT_DIR/create_log_metrics.sh"
bash "$SCRIPT_DIR/create_dashboards.sh"

echo "Observability deploy complete."
