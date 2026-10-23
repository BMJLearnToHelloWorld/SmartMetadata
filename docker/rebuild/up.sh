#!/usr/bin/env bash
# Product Docker entry. Builds the slim dist if needed, then ups the rebuilt
# stack: MySQL, Elasticsearch, slim server, Vue UI, ingest seed, MCP.
# Never starts historical development/quickstart compose.
# Map: docs/rebuild/PRODUCT_PATH.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker/rebuild/docker-compose.yml"

if ! compgen -G "openmetadata-dist/target/openmetadata-*.tar.gz" > /dev/null \
  || [[ "${FORCE_SLIM_DIST:-}" == "1" ]]; then
  echo "Building slim CCL-free dist (make slim-dist)"
  make slim-dist
else
  echo "Using existing slim tarball under openmetadata-dist/target/"
fi

python3 scripts/rebuild/check_ccl_free_dist.py --require-tarball

echo "Starting product Docker ($COMPOSE_FILE)"
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d --wait --wait-timeout 300 "$@"

echo "Checking product health"
curl -sf "http://127.0.0.1:8586/healthcheck" >/dev/null
curl -sf "http://127.0.0.1:8080/" >/dev/null

cat <<'EOF'

Product stack is up (rebuilt surfaces only).
  Console: http://localhost:8080
  API:     http://localhost:8585/api
  Admin:   http://localhost:8586/healthcheck

Seed already ran via the ingest service (scripts/rebuild/static-smoke.yaml).
More connectors (postgres / mysql / kafka / snowflake examples):
  docker compose -f docker/rebuild/docker-compose.yml exec ingest \
    smartmetadata-ingest run --config /config/your.yaml

MCP is stdio (not HTTP). The mcp service already logged in and is waiting
on stdin. Attach it, or start a fresh stdio session (entrypoint fetches JWT):
  docker attach smartmetadata_mcp
  docker compose -f docker/rebuild/docker-compose.yml run --rm -i mcp

Stop:
  make docker-down
EOF
