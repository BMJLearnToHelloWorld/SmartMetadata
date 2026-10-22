# Phase 0 — CCL-free server baseline

Shippable SmartMetadata packaging does not include Collate Community License
(CCL) modules. Official CCL source trees are **purged** from this repository
(ADR:2026-10-22-ccl-trees-are-purged). Product map:
[PRODUCT_PATH.md](PRODUCT_PATH.md). Capability gaps vs the deleted official
surfaces: [PARITY.md](PARITY.md).

This is packaging isolation plus tree hygiene, not a rewrite of the Apache
server. ADR:2026-10-22-shippable-dist-excludes-ccl-modules.

## What ships

| Tree | License | Phase 0 status |
|---|---|---|
| `openmetadata-spec`, `common`, `openmetadata-shaded-deps`, `openmetadata-service` | Apache 2.0 | **Ships** in `openmetadata-dist` |
| `openmetadata-dist` | Apache 2.0 | **Ships** — assembly of the server tarball |
| `openmetadata-sdk`, `openmetadata-clients`, `openmetadata-k8s-operator`, `docker/rdf-store` | Apache 2.0 | In the Maven reactor; **not** packaged into the server tarball |
| `smartmetadata-ui/`, `smartmetadata-ingestion/`, `smartmetadata-mcp/` | Apache 2.0 | Product rebuild; **not** Maven modules; **not** in the tarball |

`openmetadata-ui/`, `openmetadata-mcp/`, `ingestion/`,
`openmetadata-airflow-apis/`, and `openmetadata-ui-core-components/` are
**gone**. Reintroduction fails `scripts/rebuild/check_purged_trees.py`.

Product build:

```bash
make slim-dist
# equivalent:
mvn -DskipTests package -pl openmetadata-dist -am
python3 scripts/rebuild/check_ccl_free_dist.py --require-tarball
```

Tarball: `openmetadata-dist/target/openmetadata-2.0.0-SNAPSHOT.tar.gz`.

A full-root `mvn package` is the Apache reactor (no CCL modules). The
**shippable** artifact is the dist tarball / the image built from it.

## How to run the slim server

Minimum: Java 21, Maven 3.8+, MySQL ≥ 8 or Postgres ≥ 15, Elasticsearch 9.x or OpenSearch.

```bash
make slim-dist
tar -xzf openmetadata-dist/target/openmetadata-2.0.0-SNAPSHOT.tar.gz
docker compose -f docker/development/docker-compose.yml up -d mysql elasticsearch
./bootstrap/openmetadata-ops.sh migrate
./bin/openmetadata-server-start.sh conf/openmetadata.yaml
```

Local Docker wrapper (MySQL + search + slim server; no CCL ingestion image):

```bash
./docker/run_local_docker.sh
```

`./docker/run_local_docker.sh -i true` always refuses. Product ingest is
`smartmetadata-ingest`.

The server image `docker/development/Dockerfile` unpacks the dist tarball.
That tarball has no UI jar and no MCP jar.

API: `http://localhost:8585/api`. Admin: `8586`. The SPA is `smartmetadata-ui/`
(`make ui_dev`). Without `/assets/index.html` the asset servlet is not
registered; `GET /` and `GET /mcp` stay unregistered (404). MCP HTTP (`/mcp`)
is not registered. Agents use `smartmetadata-mcp/` ([PHASE10.md](PHASE10.md)).

## Verification checklist

1. `python3 scripts/rebuild/check_purged_trees.py`
2. `python3 scripts/rebuild/check_ccl_free_dist.py` — static pom + assembly
3. `make slim-dist` — compiles Apache server core and fails if the tarball contains CCL artifacts
4. `mvn -pl openmetadata-dist -am dependency:tree -DskipTests` — tree must not list
   `openmetadata-ui`, `openmetadata-mcp`, or `openmetadata-ui-core-components`
5. Optional runtime: start MySQL + ES, migrate, `curl -sf http://localhost:8586/healthcheck`

Maven Enforcer rule `ban-ccl-modules` on `openmetadata-dist` fails the dist
build if those artifacts re-enter the dependency tree.

## Non-goals (Phase 0 historical; later phases shipped the rebuild)

- Vue console, ingestion CLI, and stdio MCP are later phases (1–10), now present
  under `smartmetadata-*`.
- Do not restore purged CCL trees.
- GitHub Actions for the CCL-free rebuild is a **separate** workflow
  (`.github/workflows/smartmetadata-rebuild.yml`;
  ADR:2026-10-22-rebuild-ci-is-a-separate-workflow).
- No brand/NOTICE/trademark sweep, no secrets.

## Residual risks

- **MCP catalog entities and `McpApplication`** remain in the Apache spec/server.
  Without a CCL jar the process logs `MCP module not found in classpath` and
  continues. Agents use `smartmetadata-mcp/`.
- **`make generate`** is Maven POJOs only. There is no CCL Pydantic tree.
- **Compose env** may still name `PIPELINE_SERVICE_CLIENT_ENDPOINT=http://ingestion:8080`.
  The ingestion compose service was removed; the slim server does not start
  Airflow. Product ingest is the CLI.
