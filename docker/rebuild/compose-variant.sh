# Shared compose-file selection for product Docker.
# Default is China (DaoCloud proxies). Official registries: SM_DOCKER_VARIANT=intl.
# Sourced by up.sh and down.sh. Expects ROOT to be the repository root.
# ADR:2026-10-25-product-docker-defaults-to-china-mirrors

COMPOSE_BASE="${ROOT}/docker/rebuild/docker-compose.yml"
COMPOSE_CN="${ROOT}/docker/rebuild/docker-compose.cn.yml"
COMPOSE_INTL="${ROOT}/docker/rebuild/docker-compose.intl.yml"
VARIANT="${SM_DOCKER_VARIANT:-cn}"

case "$VARIANT" in
  cn)
    COMPOSE_FILES=(-f "$COMPOSE_BASE" -f "$COMPOSE_CN")
    VARIANT_LABEL="China (DaoCloud proxies, UI :8089)"
    ;;
  intl)
    COMPOSE_FILES=(-f "$COMPOSE_BASE" -f "$COMPOSE_INTL")
    VARIANT_LABEL="international (official registries, UI :8089)"
    ;;
  *)
    echo "SM_DOCKER_VARIANT must be cn or intl (got ${VARIANT})" >&2
    exit 1
    ;;
esac
