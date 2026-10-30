# Databricks + Unity Catalog connectors — design / scope / plan

**Status:** Locked by Bernie 2026-10-30 t210u  
**Target:** BehaviorMatched (unit) for the full official Apache OpenMetadata capability chain  
**OSS (locked):** `databricks-sql-connector`, `databricks-sdk`, `databricks-sqlalchemy` (+ thrift, ndg-httpsclient, pyOpenSSL, pyasn1 as in OM `ingestion/setup.py` plugins["databricks"])

## Scope

| Official tile | SM `source.type` | `serviceType` | Notes |
| --- | --- | --- | --- |
| Databricks | `databricks`, `databricks-lineage`, `databricks-usage` | `Databricks` | httpPath **required** |
| Unity Catalog | `unitycatalog`, `unitycatalog-lineage`, `unitycatalog-usage` | `UnityCatalog` | httpPath optional; `includeMetricViews` |

Not in scope: Collate CCL packages, inventing live credentials, ProductVerified without a real workspace.

## Capability chain (1:1 with OM `service_spec`)

| Surface | Databricks | Unity Catalog | SM landing |
| --- | --- | --- | --- |
| Connection + Test Connection | PAT / OAuth SP / Azure AD | same | `databricks_common.test_connection` + auth builders |
| Metadata | `DatabricksSource` | `UnitycatalogSource` | `databricks.py` / `unitycatalog.py` |
| Lineage | `DatabricksLineageSource` | `UnitycatalogLineageSource` | `*-lineage.py` registered sources |
| Usage | `DatabricksUsageSource` | `UnitycatalogUsageSource` | `*-usage.py` registered sources |
| Profiler + Sampler | OM interfaces | OM interfaces | `*-profiler.py` (module API + unit tests) |
| Data Quality | OM test suite | OM test suite | `*-quality.py` |
| Data Diff | `DatabricksTableParameter` | `UnityCatalogTableParameter` | `*-data_diff.py` |
| UI Add Service | OM forms | OM forms | `smartmetadata-ui` tiles + connection fields |
| dbt | cross-cutting | cross-cutting | only if SM already has pattern (no Databricks-specific invent) |

## Design (clean-room, snowflake pattern)

1. Shared `databricks_common.py`: row dataclasses, `CatalogReader` protocol, `SequenceCatalogReader`, `CursorCatalogReader` (INFORMATION_SCHEMA via `databricks.sql`), auth resolution, `test_connection`, connection config builders (secrets gated like snowflake).
2. Metadata sources emit `databaseService` → databases (catalogs) → schemas → tables/columns; optional view lineage via existing `include_view_lineage` + `parse_view_parents`.
3. Lineage sources read `system.access`-style edge rows (injectable reader) → `LineageRecord(source="QueryLineage")`.
4. Usage sources read query-history rows → `UsageRecord`.
5. Profiler/Sampler/DQ/DataDiff are **interfaces** exercised by unit tests (SM workflow type is still `metadata` only); honest Partial if a live-only path cannot be unit-proven.
6. Java/spec already enumerate `Databricks` / `UnityCatalog` and connection JSON — no schema invent; UI curated list + forms must opt them in.

## Land order

1. Dockerfile ARG fix (separate PR) → main  
2. This plan + connectors + tests + UI + extras + ledger  
3. BehaviorMatched(unit) gate; Integration/ProductVerified deferred to real env


## Honest Partial

- **Live Usage aggregation via CursorUsageReader** (SQL against `system.query.history` / configured `queryHistoryTable`): unit coverage uses `SequenceUsageReader` only. Live probe/aggregate path remains **Partial** until an IntegrationVerified run against a real workspace. Do not mark IntegrationVerified/ProductVerified without live credentials.
- Profiler/DQ/Sampler/DataDiff module APIs are BehaviorMatched(unit); catalog job runner execution of profiler/DQ remains the existing product Partial (jobs.py residual), not invented here.
