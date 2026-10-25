# Product Docker defaults to the China compose overlay and UI host port 8089

- **Status:** Accepted
- **Revisions:** v1 2026-10-25 (initial)
- **Deciders:** SmartMetadata rebuild (Bernie Bai)
- **Guard:** `scripts/rebuild/check_product_path_hints.py`; `scripts/rebuild/test_check_product_path_hints.py`
- **Related:** ADR:2026-10-23-product-docker-is-rebuild-only; `docs/rebuild/PRODUCT_PATH.md`; `docs/rebuild/DEPLOY_CN.md`

## Context

AlmaLinux product deploys hung on registries that Docker Hub `registry-mirrors`
do not rewrite: `docker.elastic.co` (Elasticsearch 9.3.0) and
`gcr.io/distroless/cc-debian13:debug-nonroot`. Maven stalled on
`maven.google.com` until Aliyun Central (`mirrorOf=*`) was set. Operators also
treated the one-shot `migrate` container `Exited 0` as a failure, and the
preferred UI entry is host **8089**, not 8080.

The product Docker surface stays `docker/rebuild/` (rebuild stack only).
Official-registry hosts still need a selectable path.

## Decision

- Default `make docker-up` / `./docker/rebuild/up.sh` uses
  `docker-compose.yml` + `docker-compose.cn.yml`. That overlay pins the same
  image name/tag through `m.daocloud.io/<original>` for Elasticsearch,
  distroless, and Hub library images used by the product Dockerfiles.
- International / CI hosts use `SM_DOCKER_VARIANT=intl` or `make docker-up-intl`
  (`docker-compose.yml` + `docker-compose.intl.yml`) with upstream-style refs.
- UI host mapping is **8089:80** on both variants. Dockerfile `FROM` lines take
  `ARG` / compose `build.args` so China can pass DaoCloud without a second
  Dockerfile and official `gcr.io` remains selectable.
- `docker/rebuild/maven-settings.cn.xml.example` is the documented Aliyun
  Central settings file (no credentials). `make slim-dist` accepts
  `MAVEN_SETTINGS=`.
- `up.sh` fail-fasts hung pulls/builds (no infinite retry) and documents
  migrate `Exited 0`. MCP entrypoint quoting stays out of this record (separate PR).

## Consequences

China Alma hosts following product docs get reachable images and UI `:8089`
without editing compose by hand. Hosts that can reach official registries opt
in with one env/Make target. Changing the default UI port or default compose
variant requires updating this record and the product-path hint guard.
