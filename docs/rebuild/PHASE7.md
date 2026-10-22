# Phase 7 — Clean-room connector batch

Phase 7 extends Apache-2.0 `smartmetadata-ingestion/` with a first production-useful
connector set. Connectors are clean-room: they follow documented `information_schema` /
Confluent HTTP / Snowflake `INFORMATION_SCHEMA` contracts and the Apache
`openmetadata-service` REST paths. They do not copy `ingestion/` or
`openmetadata-ingestion`.

Earlier phases: [PHASE0.md](PHASE0.md)–[PHASE6.md](PHASE6.md).
ADR:2026-10-22-ingestion-source-type-registry.
ADR:2026-10-22-clean-room-ingestion-framework still applies.

## What shipped

| Connector | `source.type` | Catalog mapping | Discovery |
|---|---|---|---|
| MySQL | `mysql` | DatabaseService(`Mysql`) → database → schema → table/column | `information_schema` via `CatalogReader` |
| Kafka / Confluent | `kafka` | MessagingService(`Kafka`) → Topic (`partitions`, optional `messageSchema`) | Confluent REST Proxy + Schema Registry over httpx |
| Snowflake | `snowflake` | DatabaseService(`Snowflake`) → databases → schemas → tables | `INFORMATION_SCHEMA` via `CatalogReader` |
| Postgres (Phase 6) | `postgres` | unchanged | unchanged |

Also:

- In-process registry: `source.type` selects a registered factory (`connectors/registry.py`).
- Example YAMLs under `smartmetadata-ingestion/examples/`.
- REST client + sink write `PUT /v1/services/messagingServices` and `PUT /v1/topics`.
- Optional extras: `mysql` (PyMySQL), `snowflake` (snowflake-connector-python), `kafka` (kafka-python AdminClient fallback).

## Skipped in this PR (later)

- **Filesystem / object storage** (S3/GCS/ADLS → Container): needs cloud SDKs and a Container
  record/sink path. Thin listing is possible; not needed to hit the ≥3-connector bar.
- **Dashboards** (Superset/Metabase/Tableau): extra HTTP/auth surfaces.
- **BigQuery**: Snowflake was chosen instead (clearer SQL `INFORMATION_SCHEMA`, lighter optional
  extra than `google-cloud-bigquery` + GCP auth).
- Other OM catalog types (Redshift, Databricks, Airflow, …).
- Ingestion console UI — **done in** [PHASE8.md](PHASE8.md). Prefect/Airflow operators still later.
- Profiler / DQ execution engines.

## How to run

```bash
python3 -m pip install -e 'smartmetadata-ingestion/[dev]'
# optional live drivers, one or more:
python3 -m pip install -e 'smartmetadata-ingestion/[mysql]'
python3 -m pip install -e 'smartmetadata-ingestion/[snowflake]'
python3 -m pip install -e 'smartmetadata-ingestion/[kafka]'

export OM_JWT=...
smartmetadata-ingest run --config smartmetadata-ingestion/examples/mysql-metadata.yaml
smartmetadata-ingest run --config smartmetadata-ingestion/examples/kafka-topics.yaml
smartmetadata-ingest run --config smartmetadata-ingestion/examples/snowflake-metadata.yaml
```

Unit tests inject a `CatalogReader` / `TopicReader` or an httpx `MockTransport`. Live extras are
not required for CI.

`source.storeConnectionSecrets` still defaults to **false**. Kafka REST proxy URL is a workflow
connection key (`restProxyUrl`); the catalog MessagingService entity stores the documented
`bootstrapServers` + `schemaRegistryURL` subset only.

### Manual verify

1. Example YAMLs load with `${ENV}` expansion (`tests/test_examples.py`).
2. Mocked MySQL / Snowflake readers emit service → database → schema → table (+ optional
   view lineage).
3. Mocked Kafka REST + Schema Registry emit MessagingService + Topic with `partitions` ≥ 1.
4. Sink PUTs hit `/v1/services/messagingServices` and `/v1/topics`.
5. `check_ccl_free_ingestion.py` and `check_ccl_free_dist.py` stay green.

## Tests

```bash
cd smartmetadata-ingestion && python3 -m pytest
python3 scripts/rebuild/check_ccl_free_ingestion.py
python3 scripts/rebuild/check_ccl_free_dist.py
```

## Open questions (safest default already taken)

1. **Warehouse?** **Snowflake**, not BigQuery — SQL catalog APIs and a single optional extra.
2. **Kafka discovery?** **Confluent REST Proxy HTTP** first (easy mocks, no broker client).
   `bootstrapServers` + `kafka` extra is a live fallback only.
3. **Filesystem / dashboard in this PR?** **No.** Listed above for a later batch.
4. **Plugin loading?** **In-process registry only.** No setuptools entry points.

## Verification checklist

1. `cd smartmetadata-ingestion && python3 -m pytest`
2. `python3 scripts/rebuild/check_ccl_free_ingestion.py`
3. `python3 scripts/rebuild/check_ccl_free_dist.py`
4. Optional live run against a Phase 0 server + source system
