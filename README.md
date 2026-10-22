# SmartMetadata

Apache-licensed metadata catalog: OpenMetadata **server** plus a clean-room
**Vue 3 console**, **ingestion CLI**, and **stdio MCP**. Official Collate
Community License (CCL) UI / ingestion / MCP trees are **not** in this
repository.

Product map: [docs/rebuild/PRODUCT_PATH.md](docs/rebuild/PRODUCT_PATH.md).
Parity vs the deleted official surfaces: [docs/rebuild/PARITY.md](docs/rebuild/PARITY.md).
ADR:2026-10-22-ccl-trees-are-purged.

## What you run

| Surface | Tree | Command |
|---|---|---|
| Slim Apache server | `openmetadata-service` → `openmetadata-dist` | `make slim-dist` |
| Console | `smartmetadata-ui/` | `make ui_install && make ui_dev` |
| Ingest | `smartmetadata-ingestion/` | `smartmetadata-ingest run --config …` |
| MCP | `smartmetadata-mcp/` | `cd smartmetadata-mcp && npm start` |

Local Docker (MySQL + Elasticsearch + slim server; no CCL ingestion image):

```bash
./docker/run_local_docker.sh
```

`./docker/run_local_docker.sh -i true` always refuses. Product ingest is the
CLI above, not an Airflow container.

Offline gate (no live catalog):

```bash
make verify-rebuild
```

Live catalog smoke is GitHub Actions Job C (`workflow_dispatch` on
`.github/workflows/smartmetadata-rebuild.yml`). See
[docs/rebuild/VERIFY_RUNTIME.md](docs/rebuild/VERIFY_RUNTIME.md).

## Layout

**Apache server (KEEP):** `openmetadata-spec/`, `common/`,
`openmetadata-shaded-deps/`, `openmetadata-service/`, `openmetadata-dist/`,
plus SDK / clients / k8s operator / integration tests.

**Rebuild (KEEP):** `smartmetadata-ui/` (Vue 3 + Ant Design Vue),
`smartmetadata-ingestion/` (Source→Sink runner; Postgres, MySQL, Kafka,
Snowflake), `smartmetadata-mcp/` (stdio JSON-RPC, JWT → Apache REST).

**Purged:** `openmetadata-ui/`, `openmetadata-mcp/`, `ingestion/`,
`openmetadata-airflow-apis/`, `openmetadata-ui-core-components/`, Collate
compose under `docker/docker-compose-*`. Reintroduction fails
`scripts/rebuild/check_purged_trees.py`.

Root `LICENSE` is Apache 2.0. Rebuild packages ship their own Apache
`LICENSE` files.

## Server capabilities

The Java catalog still stores technical metadata, quality tests, lineage,
glossary/classifications, domains, contracts, activity, and RBAC. The Vue
console covers login, search, table/topic detail, admin, lineage, governance,
quality/observability CRUD, services/pipelines, and activity — see
[docs/rebuild/PHASE1.md](docs/rebuild/PHASE1.md)–[PHASE9.md](docs/rebuild/PHASE9.md).

Ingestion coverage is the four connectors above, not the 100+ CCL
`service_spec.py` set that was deleted. Gaps: [docs/rebuild/PARITY.md](docs/rebuild/PARITY.md).

## Docs

| Doc | Use |
|---|---|
| [docs/rebuild/PRODUCT_PATH.md](docs/rebuild/PRODUCT_PATH.md) | What to build and run |
| [docs/rebuild/PHASE0.md](docs/rebuild/PHASE0.md) | Slim server |
| [docs/rebuild/PHASE11.md](docs/rebuild/PHASE11.md) | Go-live / `make verify-rebuild` |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Request / ingest / search paths |
| [DEVELOPER.md](DEVELOPER.md) | How to work in the Apache server |
| [AGENTS.md](AGENTS.md) | Agent/session map |
