# SmartMetadata Ingestion

Clean-room Apache-2.0 metadata ingestion for the slim OpenMetadata server.

This package is **not** `openmetadata-ingestion`. It does not copy, transpile,
or import `ingestion/`, `openmetadata-ingestion`, or `openmetadata-airflow-apis`.
It talks to documented `openmetadata-service` REST paths over HTTP.

See [docs/rebuild/PHASE6.md](../docs/rebuild/PHASE6.md),
[docs/rebuild/PHASE7.md](../docs/rebuild/PHASE7.md),
ADR:2026-10-22-clean-room-ingestion-framework, and
ADR:2026-10-22-ingestion-source-type-registry.

## Install

```bash
python3 -m pip install -e 'smartmetadata-ingestion/[dev]'
# optional live readers:
python3 -m pip install -e 'smartmetadata-ingestion/[postgres]'
python3 -m pip install -e 'smartmetadata-ingestion/[mysql]'
python3 -m pip install -e 'smartmetadata-ingestion/[snowflake]'
python3 -m pip install -e 'smartmetadata-ingestion/[kafka]'
```

## Run

```bash
export OM_JWT=...          # bot or PAT JWT
smartmetadata-ingest run --config smartmetadata-ingestion/examples/postgres-metadata.yaml
smartmetadata-ingest run --config smartmetadata-ingestion/examples/mysql-metadata.yaml
smartmetadata-ingest run --config smartmetadata-ingestion/examples/kafka-topics.yaml
smartmetadata-ingest run --config smartmetadata-ingestion/examples/snowflake-metadata.yaml
```

`source.type` selects a registered connector (`postgres`, `mysql`, `kafka`,
`snowflake`, `static`). Secrets are `${ENV}` / `${ENV:-default}` substitutions.

`auth.type: login` is also supported for local bootstrap. The password in the
config is the raw password; the client Base64-encodes it for
`POST /v1/users/login`.

## Layout

| Piece | Role |
|---|---|
| `config.py` | YAML/JSON workflow + `${ENV}` expansion |
| `runner.py` | Source → processors → Sink |
| `client/rest.py` | Self-written httpx client |
| `connectors/registry.py` | `source.type` → connector factory |
| `connectors/postgres.py` | Postgres `information_schema` |
| `connectors/mysql.py` | MySQL `information_schema` |
| `connectors/snowflake.py` | Snowflake `INFORMATION_SCHEMA` |
| `connectors/kafka.py` | Kafka / Confluent REST + Schema Registry |
| `sinks/metadata_rest.py` | PUT service / database / schema / table / topic / lineage |
| `jobs.py` | Profiler / DQ stubs only |

Jobs run as a CLI process. Prefect/Airflow operators are Phase 8.

## Tests

```bash
cd smartmetadata-ingestion && python3 -m pytest
python3 scripts/rebuild/check_ccl_free_ingestion.py
python3 scripts/rebuild/check_ccl_free_dist.py
```
