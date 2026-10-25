# Product Docker on China networks (AlmaLinux lessons)

Short runbook from AlmaLinux production deploys. Product path is **rebuild
only**: `make docker-up` → `docker/rebuild/`. Do not use
`docker/development/` or Collate quickstart.

ADR:2026-10-25-product-docker-defaults-to-china-mirrors.
Map: [PRODUCT_PATH.md](PRODUCT_PATH.md). Files: [docker/rebuild/README.md](../../docker/rebuild/README.md).

## Default vs international

| Command | Compose | Images | UI host |
|---|---|---|---|
| `make docker-up` | `docker-compose.yml` + `docker-compose.cn.yml` | DaoCloud proxy of the same name/tag | **8089** → container 80 |
| `make docker-up-intl` or `SM_DOCKER_VARIANT=intl make docker-up` | `docker-compose.yml` + `docker-compose.intl.yml` | Official Hub / `docker.elastic.co` / `gcr.io` | **8089** → container 80 |

Stop with the same variant: `make docker-down` or `SM_DOCKER_VARIANT=intl make docker-down`.

Health after up:

```bash
curl -sf http://127.0.0.1:8586/healthcheck
curl -sf http://127.0.0.1:8089/
# API: http://localhost:8585/api
# Login: admin@open-metadata.org / admin
```

## Pain points and what to do

1. **Docker Hub may need a daemon `registry-mirrors` entry.** That mirror does
   **not** cover `docker.elastic.co` or `gcr.io`. Do not assume Hub config
   unblocks Elasticsearch or distroless.

2. **Elasticsearch `elasticsearch:9.3.0` from `docker.elastic.co` timed out.**
   DaoCloud proxy of the same name/tag works:
   `m.daocloud.io/docker.elastic.co/elasticsearch/elasticsearch:9.3.0`.
   The China compose pins this. Do not invent a different tag.

3. **`gcr.io/distroless/cc-debian13:debug-nonroot` timed out.** Keep distroless;
   pull it through DaoCloud as the Dockerfile `DISTROLESS_IMAGE` build-arg:
   `m.daocloud.io/gcr.io/distroless/cc-debian13:debug-nonroot`.
   International / CI pass the official `gcr.io/…` arg.

4. **Maven stalled on `maven.google.com`.** Aliyun Central
   (`https://maven.aliyun.com/repository/central`) with `mirrorOf=*`
   unblocked it. Example (no secrets):
   `docker/rebuild/maven-settings.cn.xml.example`.

   ```bash
   make slim-dist MAVEN_SETTINGS=docker/rebuild/maven-settings.cn.xml.example
   # or copy that file to ~/.m2/settings.xml
   ```

5. **Slow pulls must switch mirror promptly.** `up.sh` fail-fasts third-party
   `docker compose pull` after `SM_PULL_TIMEOUT` (default 300s). If a pull
   hangs, Ctrl-C and change mirror — do not wait forever. Override:
   `SM_PULL_TIMEOUT=120 make docker-up`.

6. **`smartmetadata_migrate` Exited 0 is expected.** It is a one-shot
   `openmetadata-ops.sh migrate`. `up.sh` prints `docker compose ps -a` so
   operators see the exit. Do not treat it as a failed container and do not
   `restart: unless-stopped` it.

7. **MCP entrypoint `/bin/sh` quote bug** is a separate fix (PR #22). This
   runbook does not change `mcp-entrypoint.sh`.

## Daemon Hub mirror (optional)

If un-prefixed Hub pulls still hang (images not overridden by the China
compose), add a Docker daemon registry-mirror, for example
`https://docker.m.daocloud.io`, then `systemctl restart docker`. This still
does not rewrite `docker.elastic.co` or `gcr.io` — those stay on the compose
proxy paths.

## Progress and timeouts

`./docker/rebuild/up.sh` logs UTC timestamps, uses `docker compose build --progress=plain`,
and caps pull / build / wait (`SM_PULL_TIMEOUT`, `SM_BUILD_TIMEOUT`,
`SM_WAIT_TIMEOUT`). A timeout prints mirror/Maven guidance and exits non-zero.
No blind infinite retries.
