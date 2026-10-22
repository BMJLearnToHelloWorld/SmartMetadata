# Product path (CCL-free)

What to **build, run, and demo**. Official Collate Community License (CCL)
source trees are **gone** from this repository. Do not restore them.

ADR:2026-10-22-ccl-trees-are-purged.
ADR:2026-10-22-shippable-dist-excludes-ccl-modules.

## Product (this is the tree)

| Surface | Tree | How |
|---|---|---|
| Slim Apache server | `openmetadata-dist` via `openmetadata-service` | `make slim-dist` |
| Console | `smartmetadata-ui/` | `make ui_install && make ui_dev` |
| Ingest | `smartmetadata-ingestion/` | `smartmetadata-ingest run --config …` |
| MCP | `smartmetadata-mcp/` | `cd smartmetadata-mcp && npm start` |

Go-live matrix: [PHASE11.md](PHASE11.md) (`make verify-rebuild`). Slim server
runbook: [PHASE0.md](PHASE0.md). Capability gaps vs the deleted official
surfaces: [PARITY.md](PARITY.md).

Local Docker (MySQL + search + slim server; no CCL ingestion image):

```bash
./docker/run_local_docker.sh
```

## Purged (must not reappear)

`scripts/rebuild/check_purged_trees.py` fails if any of these return:

| Path | License evidence | Why deleted |
|---|---|---|
| `openmetadata-ui/` | `LICENSE` is Collate Community License 1.0 | Official React console; replaced by `smartmetadata-ui/` |
| `openmetadata-mcp/` | `LICENSE` is CCL 1.0 | Official Java MCP; replaced by `smartmetadata-mcp/` |
| `ingestion/` | `LICENSE` is CCL 1.0 | Official Python connectors; replaced by `smartmetadata-ingestion/` |
| `openmetadata-airflow-apis/` | directory `LICENSE` Apache 2.0; 66 `.py` files licensed CCL and pointed at `ingestion/LICENSE` | CCL-tainted; not on the slim product path |
| `openmetadata-ui-core-components/` | no module `LICENSE`; `package.json` says Apache-2.0 | Not required by the Vue console; existed to serve the purged React UI |
| `docker/docker-compose-quickstart/` | `docker.getcollate.io/openmetadata/*` images | Collate quickstart, not a product demo |
| `docker/docker-compose-ingestion/` | Collate ingestion image | Same |
| `docker/docker-compose-openmetadata/` | Collate server image | Same |

**Forbidden:**

- Restoring those directories or listing them in the root Maven reactor.
- `./docker/run_local_docker.sh -i true` — always refuses; product ingest is
  `smartmetadata-ingest`.
- Adding `openmetadata-ui` / `openmetadata-mcp` / ingestion back to
  `openmetadata-dist`. Gated by Maven Enforcer `ban-ccl-modules` and
  `make check-ccl-free-dist`.
- A full-root `mvn package` is the Apache reactor, not a UI/ingestion demo.
  The product server command is `make slim-dist`.

## Checks

```bash
make check-purged-trees
make check-product-path-hints
make check-ccl-free-dist
make verify-rebuild
```
