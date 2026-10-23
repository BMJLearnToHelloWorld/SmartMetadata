# Product Docker files and commands start the rebuilt stack only

- **Status:** Accepted
- **Revisions:** v1 2026-10-23 (initial)
- **Deciders:** SmartMetadata rebuild (Bernie Bai)
- **Guard:** `scripts/rebuild/check_product_path_hints.py`; `scripts/rebuild/test_check_product_path_hints.py`; `scripts/rebuild/test_require_reference_stack.py`
- **Related:** ADR:2026-10-22-ccl-trees-stay-reference-only; ADR:2026-10-22-product-make-is-rebuild-only; `docs/rebuild/PRODUCT_PATH.md`; `docs/rebuild/PARITY.md`

## Context

Product Make already fails closed for `yarn_*` / `install` / `generate`
(ADR:2026-10-22-product-make-is-rebuild-only). Local Docker did not. The
historical wrapper defaulted to a slim Maven build and named only MySQL /
Elasticsearch / migrate / server when `-i false`, but
`docker/development/docker-compose.yml` still **defines** a CCL `ingestion`
service. A bare `docker compose … up -d` still starts that container.

A slim-server-only product compose with host-side `make ui_dev` /
`make ingest_install` leftovers would still point operators at a partial
demo and at CCL counterparts. Bernie’s bar: after start, the running stack
must exercise the **already-rebuilt** surfaces talking to each other.

Deleting historical compose files is the #18 tree purge and stays out of
scope. Official 100+ connector parity is out of scope ([PARITY.md](../rebuild/PARITY.md)).

## Decision

- The product Docker surface is `docker/rebuild/`. The only recommended
  entry is `make docker-up` / `./docker/rebuild/up.sh`.
- That compose starts, by construction: official MySQL 8, official
  Elasticsearch 9, slim `openmetadata-server` (tarball from `make slim-dist`),
  `smartmetadata-ui` (nginx, same-origin `/api`), `smartmetadata-ingestion`
  (static-smoke seed, image keeps the shipped connectors), and
  `smartmetadata-mcp` (stdio). It does not define CCL ingestion, Airflow,
  Collate quickstart, `openmetadata-ui`, or `openmetadata-mcp`.
- The Vue SPA stays out of the Java dist (no second packaging ADR). The
  product start path still serves it.
- MCP stays stdio. The compose service logs in, then execs `node dist/index.js`.
  It is not the CCL `/mcp` HTTP servlet.
- `./docker/run_local_docker.sh`, `docker/development/*`, and Collate
  quickstart remain reference-only. The historical wrapper refuses unless
  `I_UNDERSTAND_REFERENCE_STACK=1`. `-i true` also needs
  `I_UNDERSTAND_CCL_INGESTION=1`.
- Job C (GHA service containers + slim tarball + Vite preview) stays the
  workflow live-smoke venue. This compose is the laptop/VM product start.

## Consequences

Someone following product docs only touches rebuilt Docker artifacts and
gets a running console, seed, and MCP — not a server-only leftover. The
historical compose files stay in git until a purge ADR; a contributor who
knows the path can still
`docker compose -f docker/development/docker-compose.yml up -d` and start
CCL ingestion. Connector families beyond postgres / mysql / kafka /
snowflake / static stay documented gaps, not silent claims of official
parity.
