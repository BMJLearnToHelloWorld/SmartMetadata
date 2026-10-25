#!/usr/bin/env bash
# Product Docker entry. Builds the slim dist if needed, then ups the rebuilt
# stack: MySQL, Elasticsearch, slim server, Vue UI, ingest seed, MCP.
# Default compose is China (DaoCloud proxies + UI :8089):
#   docker/rebuild/docker-compose.yml + docker/rebuild/docker-compose.cn.yml
# Official registries: SM_DOCKER_VARIANT=intl or `make docker-up-intl`
#   (docker-compose.yml + docker-compose.intl.yml).
# Never starts historical development/quickstart compose.
# Map: docs/rebuild/PRODUCT_PATH.md  Runbook: docs/rebuild/DEPLOY_CN.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=docker/rebuild/compose-variant.sh
source "${ROOT}/docker/rebuild/compose-variant.sh"

log() {
  printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

mirror_hint() {
  cat <<'EOF' >&2

Pull/build stalled or failed. Do not wait forever on a hung registry.

  - docker.elastic.co and gcr.io are NOT covered by Docker Hub registry-mirrors.
    The default China compose pins the same name/tag via m.daocloud.io/<original>.
  - Hub pulls that hang: add a daemon registry-mirror (e.g. https://docker.m.daocloud.io)
    or Ctrl-C and switch mirror. See docs/rebuild/DEPLOY_CN.md
  - Maven stall on maven.google.com: copy
    docker/rebuild/maven-settings.cn.xml.example to ~/.m2/settings.xml
    or `make slim-dist MAVEN_SETTINGS=docker/rebuild/maven-settings.cn.xml.example`

EOF
}

run_timed() {
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout --signal=TERM "${seconds}" "$@"
  else
    log "timeout(1) not found; running without a hard cap. Ctrl-C if this hangs."
    "$@"
  fi
}

PULL_TIMEOUT="${SM_PULL_TIMEOUT:-300}"
BUILD_TIMEOUT="${SM_BUILD_TIMEOUT:-1800}"
WAIT_TIMEOUT="${SM_WAIT_TIMEOUT:-300}"
UI_HOST_PORT="${SM_UI_HOST_PORT:-8089}"

log "Product Docker variant: ${VARIANT_LABEL}"
log "Compose files: ${COMPOSE_FILES[*]}"

if ! compgen -G "openmetadata-dist/target/openmetadata-*.tar.gz" > /dev/null \
  || [[ "${FORCE_SLIM_DIST:-}" == "1" ]]; then
  if [[ "${VARIANT}" == "cn" && -z "${MAVEN_SETTINGS:-}" && ! -f "${HOME}/.m2/settings.xml" ]]; then
    log "China Maven tip: Aliyun Central unblocks maven.google.com stalls."
    log "  make slim-dist MAVEN_SETTINGS=docker/rebuild/maven-settings.cn.xml.example"
  fi
  log "Building slim CCL-free dist (make slim-dist) — this can take several minutes"
  make slim-dist
else
  log "Using existing slim tarball under openmetadata-dist/target/"
fi

python3 scripts/rebuild/check_ccl_free_dist.py --require-tarball

log "Pulling third-party images (timeout ${PULL_TIMEOUT}s; fail-fast, no infinite retry)"
if ! run_timed "${PULL_TIMEOUT}" docker compose "${COMPOSE_FILES[@]}" pull mysql elasticsearch; then
  mirror_hint
  exit 1
fi

log "Building product images (timeout ${BUILD_TIMEOUT}s, progress=plain)"
if ! run_timed "${BUILD_TIMEOUT}" docker compose "${COMPOSE_FILES[@]}" build --progress=plain; then
  mirror_hint
  exit 1
fi

log "Starting product stack and waiting for healthy (timeout ${WAIT_TIMEOUT}s)"
if ! docker compose "${COMPOSE_FILES[@]}" up -d --wait --wait-timeout "${WAIT_TIMEOUT}" "$@"; then
  log "compose up failed; current service status:"
  docker compose "${COMPOSE_FILES[@]}" ps -a || true
  mirror_hint
  exit 1
fi

log "Service status (migrate Exited 0 is expected — one-shot, not a failure)"
docker compose "${COMPOSE_FILES[@]}" ps -a

log "Checking product health"
curl -sf "http://127.0.0.1:8586/healthcheck" >/dev/null
curl -sf "http://127.0.0.1:${UI_HOST_PORT}/" >/dev/null

cat <<EOF

Product stack is up (rebuilt surfaces only). Variant: ${VARIANT_LABEL}
  Console: http://localhost:${UI_HOST_PORT}
  API:     http://localhost:8585/api
  Admin:   http://localhost:8586/healthcheck

migrate Exited 0 is expected (one-shot schema apply). Do not restart it.
Seed already ran via the ingest service (scripts/rebuild/static-smoke.yaml).
More connectors (postgres / mysql / kafka / snowflake examples):
  docker compose ${COMPOSE_FILES[*]} exec ingest \\
    smartmetadata-ingest run --config /config/your.yaml

MCP is stdio (not HTTP). The mcp service already logged in and is waiting
on stdin. Attach it, or start a fresh stdio session (entrypoint fetches JWT):
  docker attach smartmetadata_mcp
  docker compose ${COMPOSE_FILES[*]} run --rm -i mcp

China vs international:
  make docker-up                 # default: China compose (DaoCloud)
  make docker-up-intl            # official docker.elastic.co / gcr.io / Hub
  SM_DOCKER_VARIANT=intl make docker-up

Stop:
  make docker-down
Runbook: docs/rebuild/DEPLOY_CN.md
EOF
