# SmartMetadata Ingestion

Clean-room Apache-2.0 metadata ingestion for the slim OpenMetadata server.

This package is **not** `openmetadata-ingestion`. It does not copy, transpile,
or import `ingestion/`, `openmetadata-ingestion`, or `openmetadata-airflow-apis`.
It talks to documented `openmetadata-service` REST paths over HTTP.

See [docs/rebuild/PHASE6.md](../docs/rebuild/PHASE6.md) and
ADR:2026-10-22-clean-room-ingestion-framework.

## Install

```bash
python3 -m pip install -e 'smartmetadata-ingestion/[dev]'
# optional live Postgres reader:
python3 -m pip install -e 'smartmetadata-ingestion/[postgres]'
```

## Run

```bash
export OM_JWT=...          # bot or PAT JWT
export PG_USER=...
export PG_PASSWORD=...
export PG_DATABASE=analytics

smartmetadata-ingest run --config smartmetadata-ingestion/examples/postgres-metadata.yaml
```

`auth.type: login` is also supported for local bootstrap. The password in the
config is the raw password; the client Base64-encodes it for
`POST /v1/users/login`.

## Layout

| Piece | Role |
|---|---|
| `config.py` | YAML/JSON workflow + `${ENV}` expansion |
| `runner.py` | Source → processors → Sink |
| `client/rest.py` | Self-written httpx client |
| `connectors/postgres.py` | Reference connector (`information_schema`) |
| `sinks/metadata_rest.py` | PUT service / database / schema / table / lineage |
| `jobs.py` | Profiler / DQ stubs only |

Jobs run as a CLI process. Prefect/Airflow operators are Phase 8.

## Tests

```bash
cd smartmetadata-ingestion && python3 -m pytest
python3 scripts/rebuild/check_ccl_free_ingestion.py
python3 scripts/rebuild/check_ccl_free_dist.py
```
