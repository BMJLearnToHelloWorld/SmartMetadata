# Product path (CCL-free)

What to **build, run, and demo** after the SmartMetadata rebuild. Historical
Collate Community License (CCL) trees stay in git as **reference-only**. They
are not the product. **Execution = rebuilt surfaces only.** Read the reference
trees when adding a capability later; do not run them.

ADR:2026-10-22-ccl-trees-stay-reference-only.
ADR:2026-10-22-product-make-is-rebuild-only.
ADR:2026-10-22-shippable-dist-excludes-ccl-modules.
ADR:2026-10-23-product-docker-is-rebuild-only.

## Product (ship / demo this)

`make help` (the default `make` goal) lists only these rebuilt targets.

| Surface | Tree | How |
|---|---|---|
| Slim Apache server | `openmetadata-dist` via `openmetadata-service` | `make slim-dist` (also built by `make docker-up`) |
| Console | `smartmetadata-ui/` | product compose `ui` (nginx) or `make ui_dev` |
| Ingest | `smartmetadata-ingestion/` | product compose `ingest` (static-smoke seed) |
| MCP | `smartmetadata-mcp/` | product compose `mcp` (stdio) |
| Offline matrix | rebuilt packages + gates | `make verify-rebuild` |
| Live HTTP smoke | already-running catalog | `make live-smoke` |
| Local Docker | `docker/rebuild/` | `make docker-up` |

Go-live matrix: [PHASE11.md](PHASE11.md) (`make verify-rebuild`). Slim server
runbook: [PHASE0.md](PHASE0.md). Gap matrix vs official surfaces:
[PARITY.md](PARITY.md).
ADR:2026-10-23-product-docker-is-rebuild-only.

Local Docker — one command starts the **already-rebuilt** surfaces (server,
Vue console, clean-room ingest seed, stdio MCP). This is not official 100+
connector parity; see [PARITY.md](PARITY.md).

AlmaLinux 9 (or any host with Java 21, Maven 3.8+, and Docker Compose v2):

```bash
make docker-up
# equivalent: ./docker/rebuild/up.sh

curl -sf http://127.0.0.1:8586/healthcheck
curl -sf http://127.0.0.1:8080/
# Console: http://localhost:8080
# Login:   admin@open-metadata.org / admin
# API:     http://localhost:8585/api
```

`make docker-up` never sets `I_UNDERSTAND_CCL_INGESTION`. It builds
`smartmetadata-ui` into nginx (same-origin `/api`), runs
`smartmetadata-ingest` against `scripts/rebuild/static-smoke.yaml`, and
starts `smartmetadata-mcp` on stdio. Host leftovers (`make ui_dev`,
`make ingest_install`) are optional for source-level work, not the product
start path.

Further ingest (shipped connectors only: postgres / mysql / kafka / snowflake):

```bash
docker compose -f docker/rebuild/docker-compose.yml exec ingest \
  smartmetadata-ingest run --config /config/your.yaml
```

## Not the product (reference-only)

These stay in the default checkout so later clean-room work can read behavior.
Do **not** delete them in this hygiene pass (purge is a separate counsel ADR).

| Tree | Why it is easy to misuse | Product substitute |
|---|---|---|
| `openmetadata-ui/` | Still a root-reactor Maven module; `make yarn_start_dev_ui` used to start it | `make ui_dev` |
| `openmetadata-mcp/` | ITs may pull it on the *test* classpath | `smartmetadata-mcp/` |
| `ingestion/` | `make install` used to `pip install ingestion/` | `make ingest_install` |
| `openmetadata-airflow-apis/` | VERIFY leftover (below) | not a product package |
| `openmetadata-ui-core-components` | VERIFY leftover (below); already out of dist | do not import into `smartmetadata-ui` |

Root `Makefile` does **not** `include ingestion/Makefile` on the product path.
Those recipes (and the former `yarn_*` / `generate` / `ui-checkstyle-*` /
`dev_setup` targets) live in `Makefile.reference` and are parsed only with the
escape hatch below.

**Forbidden as a product demo:**

- `make yarn_start_dev_ui`, `make install`, `make generate`, `make dev_setup`,
  and any other target that cds into the trees above. They **refuse** unless
  `I_UNDERSTAND_REFERENCE_STACK=1`.
- `./docker/run_local_docker.sh` and `docker/development/*` — historical
  compose that still **defines** a CCL `ingestion` service. The wrapper
  **refuses** unless `I_UNDERSTAND_REFERENCE_STACK=1`. Do not
  `docker compose -f docker/development/docker-compose.yml up -d` on the
  product path; a bare up without service names starts ingestion.
- `./docker/run_local_docker.sh -i true` — starts the historical CCL ingestion
  container. After the reference-stack hatch it still **refuses** unless
  `I_UNDERSTAND_CCL_INGESTION=1`. Historical skills (`test-locally`,
  `ui-pr-recording`, `connector-building`) that still use that flag must export
  both envs; they are the CCL reference stack, not a product demo.
- Collate **quickstart** compose (`docker/docker-compose-quickstart/`, images
  under `docker.getcollate.io/openmetadata/…`). `docker/docker-compose-quickstart/up.sh`
  refuses unless `I_UNDERSTAND_REFERENCE_STACK=1`.
- Adding `openmetadata-ui` / `openmetadata-mcp` / ingestion back to
  `openmetadata-dist`. Already gated by Maven Enforcer `ban-ccl-modules` and
  `make check-ccl-free-dist` — do not add a second pom scanner.
- A full-root `mvn package` as “the product build”. That still *compiles* CCL
  reactor modules. The product command is `make slim-dist`
  (`mvn -DskipTests package -pl openmetadata-dist -am`).

## Escape hatch (rare reference-stack demos)

Two acknowledgements, on purpose:

| Hatch | Unlocks | Does not unlock |
|---|---|---|
| `I_UNDERSTAND_REFERENCE_STACK=1` | Root Make recipes in `Makefile.reference` plus `include ingestion/Makefile`; `scripts/dev_setup.sh`; quickstart `up.sh`; `./docker/run_local_docker.sh` | docker `-i true` |
| `I_UNDERSTAND_CCL_INGESTION=1` | `./docker/run_local_docker.sh -i true` (also needs the reference-stack hatch) | `make yarn_start_dev_ui` / `make install` / `make docker-up` |

Example (not a product demo):

```bash
I_UNDERSTAND_REFERENCE_STACK=1 make yarn_start_dev_ui
I_UNDERSTAND_REFERENCE_STACK=1 make install
I_UNDERSTAND_REFERENCE_STACK=1 I_UNDERSTAND_CCL_INGESTION=1 ./docker/run_local_docker.sh -i true
```

`cd ingestion && make` / `make -C ingestion` still runs `ingestion/Makefile` directly.
That path is not the product Make namespace; historical Collate CI cds there. Do not
use it for product work. Removing it is the #18 purge, not this PR.

`I_UNDERSTAND_CCL_INGESTION=1` is **not** enough for Make. Product CI (Job A
`verify-rebuild`, Job B `slim-dist`, Job C `live-smoke`) never sets either hatch
and never invokes the reference trees.

## VERIFY leftovers (counsel, not this PR)

- **`openmetadata-airflow-apis/`** — directory `LICENSE` is Apache 2.0; many
  `.py` headers say Collate Community License and point at `ingestion/LICENSE`.
- **`openmetadata-ui-core-components`** — no module `LICENSE`; `package.json`
  claims Apache-2.0. It is **not** in the shippable dist.

Do not treat either as shipped product. Do not “fix” the header/LICENSE
conflict here.

## Checks

```bash
make help                       # rebuilt targets only (includes docker-up)
make check-product-path-hints   # docs + product Docker + historical acks
make check-ccl-free-dist        # dist pom/assembly/tarball (not duplicated here)
make verify-rebuild             # offline product matrix, includes both
```
