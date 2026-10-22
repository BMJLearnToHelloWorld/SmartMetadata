# Phase 0 — CCL-free server baseline

Shippable SmartMetadata packaging no longer includes Collate Community License
(CCL) modules. Historical CCL trees stay in git as **reference-only**. They are
not copied into new product modules.

This is packaging isolation, not a rewrite.
ADR:2026-10-22-shippable-dist-excludes-ccl-modules.

## What ships vs what stays in-tree

| Tree | License (module-level) | Phase 0 status |
|---|---|---|
| `openmetadata-spec`, `common`, `openmetadata-shaded-deps`, `openmetadata-service` | Apache 2.0 (root / no module LICENSE) | **Ships** in `openmetadata-dist` |
| `openmetadata-dist` | Apache 2.0 | **Ships** — assembly of the server tarball |
| `openmetadata-sdk`, `openmetadata-clients`, `openmetadata-k8s-operator`, `docker/rdf-store` | Apache 2.0 | In the Maven reactor; **not** packaged into the server tarball |
| `openmetadata-ui` | CCL | **Reference-only.** Still a reactor module so historical CI (`-pl !openmetadata-ui`) resolves. **Not** a dist dependency. |
| `openmetadata-ui-core-components` | VERIFY (no module LICENSE; `package.json` says Apache-2.0) | **Reference-only.** Not shipped. Do not import into the product UI. |
| `openmetadata-mcp` | CCL | **Reference-only.** Server loads `org.openmetadata.mcp.McpServer` by reflection and skips if absent. Integration tests still have a *test-scoped* mcp dependency. |
| `ingestion/` | CCL | **Reference-only.** Not a Maven module. Not in the tarball. PyPI `openmetadata-ingestion` is not a product dependency. |
| `openmetadata-airflow-apis/` | VERIFY (directory Apache 2.0; many `.py` headers point at `ingestion/LICENSE`) | **Reference-only.** Not packaged. |

Product build (does **not** pull UI, MCP, or ingestion into the reactor closure):

```bash
make slim-dist
# equivalent:
mvn -DskipTests package -pl openmetadata-dist -am
python3 scripts/rebuild/check_ccl_free_dist.py --require-tarball
```

Tarball: `openmetadata-dist/target/openmetadata-2.0.0-SNAPSHOT.tar.gz`.

A full-root `mvn package` still *compiles* the CCL Maven modules because they remain listed in the
root reactor. That is intentional (existing CI uses `-pl !openmetadata-ui`). The **shippable**
artifact is the dist tarball / the image built from it, and that classpath is what the gate checks.

## How to run the slim server

Minimum: Java 21, Maven 3.8+, MySQL ≥ 8 or Postgres ≥ 15, Elasticsearch 9.x or OpenSearch.

```bash
make slim-dist
tar -xzf openmetadata-dist/target/openmetadata-2.0.0-SNAPSHOT.tar.gz
# Start MySQL + Elasticsearch (no ingestion container):
docker compose -f docker/development/docker-compose.yml up -d mysql elasticsearch
# From the unpacked dist, with conf/openmetadata.yaml pointed at those services:
./bootstrap/openmetadata-ops.sh migrate
./bin/openmetadata-server-start.sh conf/openmetadata.yaml
```

Local Docker wrapper now defaults to the slim path (no UI package, no ingestion container):

```bash
./docker/run_local_docker.sh
# historical CCL ingestion container: ./docker/run_local_docker.sh -i true
```

The server image `docker/development/Dockerfile` unpacks whatever tarball `openmetadata-dist`
produced. After Phase 0 that tarball has no UI jar and no MCP jar.

API: `http://localhost:8585/api`. Admin: `8586`. The SPA is not packaged; `GET /` is not a product
UI (the asset servlet still maps `/*` and will 404 without `/assets`). MCP HTTP (`/mcp`) is not
registered without the CCL module.

## Verification checklist

1. `python3 scripts/rebuild/check_ccl_free_dist.py` — static pom + assembly (no build required).
2. `make slim-dist` — compiles Apache server core and fails if the tarball contains CCL artifacts.
3. `mvn -pl openmetadata-dist -am dependency:tree -DskipTests` — tree must not list
   `openmetadata-ui`, `openmetadata-mcp`, or `openmetadata-ui-core-components`.
4. Optional runtime: start MySQL + ES, migrate, `curl -sf http://localhost:8586/healthcheck`.
   A full Docker healthcheck is not required to close Phase 0.
5. Pre-commit hook `ccl-free-dist` runs the same static check when `openmetadata-dist/` changes.

Maven Enforcer rule `ban-ccl-modules` on `openmetadata-dist` fails the dist build if those
artifacts re-enter the dependency tree.

## Non-goals (Phase 0)

- No new frontend (Vue3 + Ant Design Vue is a later phase). No empty UI scaffolding.
- No ingestion rebuild, no MCP rebuild, no clean-room connectors.
- No deletion of historical CCL source trees.
- No OSS-feature parity UI, lineage graph, or collection console.
- No GitHub Actions workflow edits (workflows are a supply-chain surface). Wire
  `make verify-rebuild` (includes `check-ccl-free-dist`) into CI when that is
  explicitly authorized — see [PHASE11.md](PHASE11.md).
- No brand/NOTICE/trademark sweep, no secrets, no fake business logic.
- Do not treat Ant Design + Less, MUI, or Webpack as the go-forward UI stack.

## Residual risks

- **In-tree CCL source.** Anyone can still `mvn package` UI/MCP or `pip install ingestion/`.
  Shipping policy is the dist/runtime classpath, not a git sparse checkout.
- **`openmetadata-integration-tests` test-scoped `openmetadata-mcp`.** Full IT runs that need
  `/mcp` still pull the CCL module onto the *test* classpath. The server dist does not.
- **Compose files** under `docker/docker-compose-quickstart/` and `docker/development/` still
  *define* an `ingestion` service (Collate image / local CCL build). Default local run no longer
  starts it. Those files are historical reference until a later compose cleanup.
- **MCP catalog entities and `McpApplication`** remain in the Apache spec/server. Without the CCL
  jar the process logs `MCP module not found in classpath` and continues. Agents use the
  standalone Apache process in [PHASE10.md](PHASE10.md) (`smartmetadata-mcp/`), not the CCL jar.
- **`openmetadata-airflow-apis/` and `openmetadata-ui-core-components`** are VERIFY for counsel;
  they are not in the shippable server tarball.
- **`make generate` / `include ingestion/Makefile`** still exist for developers working in the
  reference ingestion tree. The slim server Java build does not need them (POJOs come from Maven).
