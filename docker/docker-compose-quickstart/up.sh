#!/usr/bin/env bash
# Fail-closed wrapper for the historical Collate quickstart compose.
# Product path: ./docker/run_local_docker.sh (do not pass -i true).
# Map: docs/rebuild/PRODUCT_PATH.md
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
python3 "$ROOT/scripts/rebuild/require_reference_stack.py" --target compose-quickstart
cd "$(dirname "${BASH_SOURCE[0]}")"
exec docker compose -f docker-compose.yml "$@"
