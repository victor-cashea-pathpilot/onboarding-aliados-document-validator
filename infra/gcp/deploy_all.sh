#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bash "$SCRIPT_DIR/bootstrap.sh"
bash "$SCRIPT_DIR/deploy_worker.sh"
bash "$SCRIPT_DIR/deploy_api.sh"
bash "$SCRIPT_DIR/deploy_api_grpc.sh"
bash "$SCRIPT_DIR/deploy_case_explorer.sh"

echo "Full deploy complete."
