# Product Docker (`docker/rebuild/`)

CCL-free SmartMetadata stack. Historical `docker/development/` and Collate
quickstart are not this path.

## Default (China)

```bash
make docker-up
# equivalent: ./docker/rebuild/up.sh
```

Uses `docker-compose.yml` + `docker-compose.cn.yml`:

- Elasticsearch via DaoCloud elastic proxy (Hub mirrors do **not** cover `docker.elastic.co`)
- Distroless / Hub library images via `m.daocloud.io/<original>`
- UI host port **8089** → container 80
- API `8585`, admin health `8586`

## International (official registries)

```bash
make docker-up-intl
# equivalent: SM_DOCKER_VARIANT=intl ./docker/rebuild/up.sh
```

Uses `docker-compose.yml` + `docker-compose.intl.yml` (upstream-style image refs).
UI stays on **8089**.

## Alma / China runbook

[docs/rebuild/DEPLOY_CN.md](../../docs/rebuild/DEPLOY_CN.md) — timeouts, mirrors,
Aliyun Maven, migrate `Exited 0`, switch-mirror-when-stalled.

Stop: `make docker-down` (same `SM_DOCKER_VARIANT` as up).
