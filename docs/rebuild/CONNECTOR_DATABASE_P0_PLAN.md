# Database P0 connectors — Redshift / MariaDB / Greenplum / Timescale

**Status:** Locked by Bernie 2026-10-30 t219u (Database P0 全链路; all four)  
**Target:** BehaviorMatched (unit) for each official Apache OpenMetadata capability surface  
**OSS (locked from `ingestion/setup.py` plugins / commons — no invent):**
- **Redshift:** `sqlalchemy-redshift~=1.0.0`, `psycopg2-binary`, `GeoAlchemy2` — **do not** install `collate-data-diff`
- **MariaDB:** no dedicated plugins key; MySQL-family `pymysql>=1.1,<2` (OM MariaDB connection / MySQL protocol)
- **Greenplum:** COMMONS["postgres"] → `pymysql`, `psycopg2-binary`, `GeoAlchemy2`, `packaging`
- **Timescale:** postgres-family → `psycopg2-binary`, `GeoAlchemy2`, `packaging` (no dedicated plugin key)

## Scope

| Official tile | SM `source.type` | `serviceType` | Notes |
| --- | --- | --- | --- |
| Amazon Redshift | `redshift`, `redshift-lineage`, `redshift-usage` | `Redshift` | Multi-DB; scheme `redshift+psycopg2`; authType password |
| MariaDB | `mariadb`, `mariadb-lineage` | `MariaDB` | MySQL-protocol; password top-level; scheme `mysql+pymysql` |
| Greenplum | `greenplum`, `greenplum-lineage` | `Greenplum` | Postgres-family; scheme `postgresql+psycopg2`; authType |
| Timescale | `timescale`, `timescale-lineage`, `timescale-usage` | `Timescale` | Postgres-family + usage + sampler; authType |

Not in scope: Collate CCL, inventing Usage/DataDiff where official `service_spec` omits them, ProductVerified without a live DB.

## Capability chain (1:1 with OM `service_spec` + connection schema flags)

| Surface | Redshift | MariaDB | Greenplum | Timescale | SM landing |
| --- | --- | --- | --- | --- | --- |
| Connection + Test | yes | yes | yes | yes | `*_common.run_connection_test` |
| Metadata | yes | yes | yes | yes | `*.py` |
| Lineage | yes | yes | yes | yes | `*_lineage.py` |
| Usage | yes | **absent** (no invent) | **absent** | yes | redshift/timescale `_usage.py` only |
| Profiler | yes | yes (schema flag) | yes (schema flag) | yes (schema flag) | `*_profiler.py` interfaces |
| Sampler | via profiler/sample helper | sample helper | sample helper | yes (service_spec) | SampleHelper APIs |
| Data Diff | **do not invent** / no collate-data-diff | absent | absent | absent | — |
| DQ test suite | generic SQL | generic SQL | generic SQL | generic SQL | `*_quality.py` |
| UI Add Service | OM fields | OM fields | OM fields | OM fields | tiles + `ServiceConnectionFields.vue` |

## Design (clean-room, #64 Databricks / #66 Doris+MSSQL patterns)

1. Injectable `CatalogReader` / `LineageReader` / `UsageReader` / `ProfileReader` + `Sequence*` for unit BehaviorMatched.
2. MariaDB ≈ Doris/MySQL: service → databaseName → schemas → tables; view lineage via `parse_view_parents`; password top-level.
3. Redshift / Greenplum / Timescale ≈ MSSQL multi-DB postgres-family: databases → schemas → tables; `ingestAllDatabases`; authType password; system schema excludes align with OM postgres-family defaults.
4. Profiler/Sampler/DQ are **interfaces** unit-tested; catalog job runner execution remains existing Partial (`jobs.py`).
5. Java/spec already enumerate these service types — no schema invent; UI curated list opts them in.

## Honest Partial

- Live Cursor* readers against real Redshift/MariaDB/Greenplum/Timescale: unit coverage uses Sequence* only → IntegrationVerified deferred.
- Profiler/DQ **job execution** residual unchanged.
- MariaDB / Greenplum: no Usage (official service_spec omits).
- No Data Diff / collate-data-diff for any of the four.

## Self-review (COMMENT — not APPROVE)

**Landing quality**
- Surfaces match OM `service_spec` per connector; no invent of Usage/DataDiff where absent.
- UI tiles + forms use official fields only (MariaDB: hostPort/username/password/databaseName/databaseSchema; PG-family: hostPort/username/password/database/ingestAllDatabases + schemes).
- Unit BehaviorMatched: `test_{mariadb,redshift,greenplum,timescale}.py` + UI connections/cliWorkflow; registry loads all source types.

**Design approach**
- Clean-room Databricks/Doris/MSSQL pattern: injectable readers + Sequence*; live Cursor* deferred (honest Partial).
- OSS locked from `ingestion/setup.py` only; no collate-data-diff.

**Honest Partial**
- Live IntegrationVerified deferred (no live DB).
- Profiler/DQ job execution residual unchanged.
