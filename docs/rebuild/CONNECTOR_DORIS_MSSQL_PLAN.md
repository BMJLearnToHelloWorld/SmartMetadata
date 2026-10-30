# Doris + MSSQL connectors — design / scope / plan

**Status:** Locked by Bernie 2026-10-30 t215u  
**Target:** BehaviorMatched (unit) for each official Apache OpenMetadata capability surface  
**OSS (locked from `ingestion/setup.py` plugins):**
- Doris: `pydoris==1.2.0` (official `plugins["doris"]`); live DB-API via PyMySQL per OM ADR (Doris MySQL protocol; images avoid mysqlclient/MariaDB client)
- MSSQL: `sqlalchemy-pytds~=1.0` (official `plugins["mssql"]` default scheme `mssql+pytds`); optional `pyodbc~=5.3.0` (`plugins["mssql-odbc"]`), `pymssql~=2.3.9` (`plugins["pymssql"]`)
- **Not** installing Collate `collate-data-diff` — clean-room `MssqlTableParameter` builder only (same spirit as Databricks)

## Scope

| Official tile | SM `source.type` | `serviceType` | Notes |
| --- | --- | --- | --- |
| Doris | `doris`, `doris-lineage` | `Doris` | MySQL-protocol; password top-level in OM schema |
| Microsoft SQL Server | `mssql`, `mssql-lineage`, `mssql-usage` | `Mssql` | Multi-DB; scheme pytds/pyodbc/pymssql |

Not in scope: Collate CCL, inventing live credentials, ProductVerified without a real Doris/MSSQL.

## Capability chain (1:1 with OM `service_spec` + connection schema flags)

| Surface | Doris (official) | MSSQL (official) | SM landing |
| --- | --- | --- | --- |
| Connection + Test | `DorisConnection` | `MssqlConnection` | `*_common.run_connection_test` + live connect helpers |
| Metadata | `DorisSource` | `MssqlSource` | `doris.py` / `mssql.py` |
| Lineage | `DorisLineageSource` (view lineage) | `MssqlLineageSource` | `*-lineage.py` |
| Usage | **absent** (do not invent) | `MssqlUsageSource` | `mssql-usage` only |
| Profiler | schema `supportsProfiler` | schema `supportsProfiler` + sampler_class | `*-profiler.py` |
| Sampler | no `sampler_class` in service_spec | `MssqlSampler` | MSSQL sampler interface only |
| Data Diff | **absent** | `MssqlTableParameter` | `mssql_data_diff.py` only |
| DQ test suite | generic SQL surface | generic SQL surface | `*-quality.py` module APIs |
| UI Add Service | OM Doris form fields | OM Mssql form fields | tiles + `ServiceConnectionFields.vue` |

## Design (clean-room, Databricks / MySQL / Snowflake patterns)

1. Injectable `CatalogReader` / `LineageReader` / `UsageReader` / `ProfileReader` + `Sequence*` for unit BehaviorMatched.
2. Doris catalogs as MySQL-style: service → databaseName (default `default`) → schemas (Doris DBs) → tables/columns; view lineage via `parse_view_parents`.
3. MSSQL multi-DB like Snowflake: databases → schemas → tables; system DB/schema excludes match OM defaults (`msdb`/`model`/`tempdb`; `sys`/`information_schema`/`guest`/`db_*`).
4. Profiler/Sampler/DQ/DataDiff are **interfaces** unit-tested; catalog job runner execution remains existing Partial (`jobs.py`).
5. Java/spec already enumerate `Doris` / `Mssql` — no schema invent; UI curated list opts them in.

## Honest Partial

- Live Cursor* readers against real Doris/MSSQL: unit coverage uses Sequence* only → IntegrationVerified deferred.
- Profiler/DQ **job execution** residual unchanged.
- Doris: no Usage / Data Diff / dedicated sampler_class (official service_spec omits them).


## Self-review (COMMENT — not APPROVE)

**Landing quality**
- Doris surfaces match OM service_spec + connection schema: Metadata, Lineage (view), Connection/Test, Profiler/DQ interfaces. No Usage / DataDiff / sampler_class invented.
- MSSQL surfaces match OM: Metadata, Lineage, Usage, Sampler, Profiler, DataDiff (MssqlTableParameter), Connection/Test, DQ interface. Multi-DB + system DB/schema excludes align with OM defaults.
- UI tiles + forms use official fields only (Doris: hostPort/username/password/databaseName/databaseSchema/scheme=doris; MSSQL: hostPort/username/password/database/scheme/driver/encrypt/trustServerCertificate/ingestAllDatabases/includeSynonyms).
- Unit BehaviorMatched: 	est_doris.py + 	est_mssql.py (12) + UI connections/cliWorkflow (12). Registry loads doris/doris-lineage/mssql/mssql-lineage/mssql-usage.

**Design approach**
- Clean-room Databricks/MySQL pattern: injectable Catalog/Lineage/Usage/Profile readers + Sequence* for unit proof; live Cursor* deferred (honest Partial).
- OSS locked from ingestion/setup.py: Doris pydoris==1.2.0 (+ PyMySQL live MySQL protocol); MSSQL sqlalchemy-pytds~=1.0 (+ optional pyodbc/pymssql). No collate-data-diff.
- Password top-level for Doris/Mssql (OM schema), not inventing authType for them.

**Honest Partial**
- Live Doris/MSSQL Cursor* IntegrationVerified deferred (no live DB).
- Profiler/DQ job execution residual unchanged.
