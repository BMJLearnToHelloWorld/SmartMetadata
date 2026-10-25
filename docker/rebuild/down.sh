#!/usr/bin/env bash
# Stop the rebuilt product Docker stack (same variant as up.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=docker/rebuild/compose-variant.sh
source "${ROOT}/docker/rebuild/compose-variant.sh"

echo "Stopping product Docker (${VARIANT_LABEL})"
docker compose "${COMPOSE_FILES[@]}" down --remove-orphans "$@"
