# Product path (CCL-free)

What to **build, run, and demo** after the SmartMetadata rebuild. Historical
Collate Community License (CCL) trees stay in git as **reference-only**. They
are not the product.

ADR:2026-10-22-ccl-trees-stay-reference-only.
ADR:2026-10-22-shippable-dist-excludes-ccl-modules.

## Product (ship / demo this)

| Surface | Tree | How |
|---|---|---|
| Slim Apache server | `openmetadata-dist` via `openmetadata-service` | `make slim-dist` |
| Console | `smartmetadata-ui/` | `make ui_install && make ui_dev` |
| Ingest | `smartmetadata-ingestion/` | `smartmetadata-ingest run --config …` |
| MCP | `smartmetadata-mcp/` | `cd smartmetadata-mcp && npm start` |

Go-live matrix: [PHASE11.md](PHASE11.md) (`make verify-rebuild`). Slim server
runbook: [PHASE0.md](PHASE0.md).

Local Docker **without** CCL ingestion:

```bash
./docker/run_local_docker.sh
```

## Not the product (reference-only)

These stay in the default checkout so later clean-room work can read behavior.
Do **not** delete them in this hygiene pass (purge is a separate counsel ADR).

| Tree | Why it is easy to misuse | Product substitute |
|---|---|---|
| `openmetadata-ui/` | Still a root-reactor Maven module | `smartmetadata-ui/` |
| `openmetadata-mcp/` | ITs may pull it on the *test* classpath | `smartmetadata-mcp/` |
| `ingestion/` | `pip install ingestion/` still works | `smartmetadata-ingestion/` |
| `openmetadata-airflow-apis/` | VERIFY leftover (below) | not a product package |
| `openmetadata-ui-core-components` | VERIFY leftover (below); already out of dist | do not import into `smartmetadata-ui` |

**Forbidden as a product demo:**

- `./docker/run_local_docker.sh -i true` — starts the historical CCL ingestion
  container. The script warns and **refuses** unless
  `I_UNDERSTAND_CCL_INGESTION=1`. Historical skills (`test-locally`,
  `ui-pr-recording`, `connector-building`) that still use that flag must export
  the env; they are the CCL reference stack, not a product demo.
- Collate **quickstart** compose (`docker/docker-compose-quickstart/`, images
  under `docker.getcollate.io/openmetadata/…`).
- Adding `openmetadata-ui` / `openmetadata-mcp` / ingestion back to
  `openmetadata-dist`. Already gated by Maven Enforcer `ban-ccl-modules` and
  `make check-ccl-free-dist` — do not add a second pom scanner.
- A full-root `mvn package` as “the product build”. That still *compiles* CCL
  reactor modules. The product command is `make slim-dist`
  (`mvn -DskipTests package -pl openmetadata-dist -am`).

## VERIFY leftovers (counsel, not this PR)

- **`openmetadata-airflow-apis/`** — directory `LICENSE` is Apache 2.0; many
  `.py` headers say Collate Community License and point at `ingestion/LICENSE`.
- **`openmetadata-ui-core-components`** — no module `LICENSE`; `package.json`
  claims Apache-2.0. It is **not** in the shippable dist.

Do not treat either as shipped product. Do not “fix” the header/LICENSE
conflict here.

## Checks

```bash
make check-product-path-hints   # docs + docker ack still present
make check-ccl-free-dist        # dist pom/assembly/tarball (not duplicated here)
make verify-rebuild             # offline product matrix, includes both
```
