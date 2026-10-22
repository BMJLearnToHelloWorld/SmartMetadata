# Phase 6 — Clean-room ingestion framework

Phase 6 adds a **new** Apache-2.0 Python package at `smartmetadata-ingestion/`.
It replaces CCL `ingestion/` / `openmetadata-ingestion` for product use.
Official CCL ingestion was **purged** (ADR:2026-10-22-ccl-trees-are-purged).
This package does not copy, transpile, import, or depend on that tree or on
`openmetadata-airflow-apis`.

Earlier phases: [PHASE0.md](PHASE0.md) (slim dist) · [PHASE1.md](PHASE1.md)–[PHASE5.md](PHASE5.md)
(clean-room Vue console).
ADR:2026-10-22-clean-room-ingestion-framework.
ADR:2026-10-22-shippable-dist-excludes-ccl-modules still applies.

## What shipped

| Piece | Location | Server contract |
|---|---|---|
| Workflow config | `smartmetadata_ingestion/config.py` | YAML/JSON; `${VAR}` / `${VAR:-default}`; no hardcoded secrets |
| Runner | `runner.py` | Source → processors → Sink; pagination is in the client; errors + progress hooks |
| REST client | `client/rest.py` | JWT or `POST /v1/users/login` (Base64 password); `Authorization: Bearer` |
| DatabaseService | same | `PUT /v1/services/databaseServices` (`name` + `serviceType`) |
| Database | same | `PUT /v1/databases` (`name` + `service`) |
| Schema | same | `PUT /v1/databaseSchemas` (`name` + `database` FQN) |
| Table | same | `PUT /v1/tables` (`name` + `columns` + `databaseSchema`) |
| Lineage | same | `PUT /v1/lineage/{fromType}/name/{fromFQN}/{toType}/name/{toFQN}` |
| Postgres connector | `connectors/postgres.py` | `information_schema` via a `CatalogReader` (psycopg extra for live DB) |
| CLI | `cli.py` | `smartmetadata-ingest run --config path` |
| License gate | `scripts/rebuild/check_ccl_free_ingestion.py` | Fails on CCL ingestion / airflow-apis imports or deps |

Jobs run as a local CLI/process. There is no Airflow/Prefect operator in this
phase. `jobs.py` only stubs profiler and quality runners.

## How to run

```bash
python3 -m pip install -e 'smartmetadata-ingestion/[dev]'
# live Postgres only:
python3 -m pip install -e 'smartmetadata-ingestion/[postgres]'

export OM_JWT=...          # bot or PAT
export PG_USER=...
export PG_PASSWORD=...
export PG_DATABASE=analytics

smartmetadata-ingest run --config smartmetadata-ingestion/examples/postgres-metadata.yaml
```

Server: slim Apache stack from [PHASE0.md](PHASE0.md). `server.hostPort` is the
API root. A bare origin such as `http://localhost:8585` is rewritten to
`…/api`. The write principal needs create/edit on database services, databases,
schemas, tables, and lineage.

`source.storeConnectionSecrets` defaults to **false**. The catalog service
entity stores host/user/database, not the source password.

### Manual verify

1. `smartmetadata-ingest run --config …` against a mocked or live server prints
   a JSON report (`succeeded` / `failed`).
2. A missing `${OM_JWT}` fails closed before any HTTP call.
3. With a running server + bot JWT + a small Postgres, Search / asset detail
   in `smartmetadata-ui` show the service → database → schema → table tree.
4. A view with `includeViewLineage: true` writes
   `PUT /v1/lineage/table/name/{from}/table/name/{to}`.

## Tests

```bash
cd smartmetadata-ingestion && python3 -m pytest
python3 scripts/rebuild/check_ccl_free_ingestion.py
python3 scripts/rebuild/check_ccl_free_dist.py
```

Covered: env expansion; login Base64 + JWT header; documented PUT paths;
pagination `after`; Postgres `information_schema` mapping; view-lineage parse;
runner error collection / `failFast`; CLI report; CCL import gate.

## Non-goals (later phases)

- Full connector catalog — first production batch is [PHASE7.md](PHASE7.md)
- Ingestion console UI — **done in** [PHASE8.md](PHASE8.md) (catalog CRUD; CLI still runs the job)
- Prefect / native Airflow operator (still later)
- Profiler and DQ job execution (interfaces stubbed only)
- Shipping the SPA in `openmetadata-dist`
- MCP
- Depending on `openmetadata-airflow-apis`

## Residual risks and open questions

- **Live Postgres is optional.** Unit tests inject a `CatalogReader`. The
  `postgres` extra pulls `psycopg`. Without it, live reads fail with an install
  message.
- **View lineage is conservative.** Only `FROM` / `JOIN` identifiers in
  `information_schema.views.view_definition` are emitted. CTEs, functions, and
  cross-database names are skipped.
- **Service connection payload** is a documented Postgres subset
  (`type`, `hostPort`, `username`, `database`, optional `authType.password`).
  It is not a generated Pydantic model from `openmetadata-spec`.
- **No Airflow.** UI "deploy pipeline" still has no CCL-free operator.

## Open questions (safest default already taken)

1. **Orchestrator?** **CLI/process only.** Phase 8 did not add Prefect; it documents the same default.
2. **Persist source passwords on the service entity?** **No**, unless
   `storeConnectionSecrets: true`.
3. **Generate the REST client from OpenAPI?** **No** for MVP — a thin httpx
   wrapper over documented paths is enough and avoids bundling CCL SDK code.
4. **Package name `smartmetadata-ingestion` vs `smartmetadata-ingest`?**
   Package is `smartmetadata-ingestion`; CLI is `smartmetadata-ingest`.

## Verification checklist

1. `cd smartmetadata-ingestion && python3 -m pytest`
2. `python3 scripts/rebuild/check_ccl_free_ingestion.py`
3. `python3 scripts/rebuild/check_ccl_free_dist.py`
4. Optional live run against a Phase 0 server
