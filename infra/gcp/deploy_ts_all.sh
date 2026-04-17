#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

bash "$ROOT_DIR/infra/gcp/deploy_ts_worker.sh"
bash "$ROOT_DIR/infra/gcp/deploy_ts_api.sh"
bash "$ROOT_DIR/infra/gcp/deploy_ts_case_explorer.sh"
