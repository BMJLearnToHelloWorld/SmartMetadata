#!/usr/bin/env bash
# Stop the rebuilt product Docker stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
docker compose -f docker/rebuild/docker-compose.yml down --remove-orphans "$@"
