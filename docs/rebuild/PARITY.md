# Capability parity (SmartMetadata vs official OpenMetadata surfaces)

Evidence captured on `origin/main` at `4f4d7f1800` (this repository, **CCL
trees still present as reference-only**). This is parity with official
OpenMetadata **product surfaces**, not Collate-only AI/RDF scope.

Closed PR #18 drafted an earlier `PARITY.md` on a purge branch. Counts below
were **re-verified on main**; do not treat #18 as merged. Do **not** purge
reference trees in the same change as filling gaps
(ADR:2026-10-22-ccl-trees-stay-reference-only).

**This file is a matrix and a stop-list, not a license to invent a batch.**
Bernie Bai: stop on difficulty, ambiguity, license doubt, or scope (which
surface first, which OSS library, how to map a service type). Prefer a
smaller production-correct batch over a large incomplete surface. Do not
ship placeholder/half-wired “parity”.

## How counts were taken

| Surface | Command / path | Result |
|---|---|---|
| Official connectors | `ingestion/src/metadata/ingestion/source/**/service_spec.py` | **106** files |
| Product connectors | `smartmetadata-ingestion/src/smartmetadata_ingestion/connectors/*.py` (excluding `base`, `registry`, `select`, `sql_views`) | **4** (`postgres`, `mysql`, `kafka`, `snowflake`) |
| Official MCP tools | `openmetadata-mcp/src/main/resources/json/data/mcp/tools.json` `tools[].name` | **21** |
| Product MCP tools | `smartmetadata-mcp/src/tools.ts` `TOOL_NAMES` | **7** |
| Product UI routes | `smartmetadata-ui/src/router/index.ts` | Login, search, table/topic asset, lineage, admin, governance, quality, observability, ingestion console, collaboration |
| Official UI pages | `openmetadata-ui/src/main/resources/ui/src/pages/` | 100+ page modules (React, CCL) — used only as an area list, not copied |

Official connector families (file counts): 52 database, 19 dashboard, 16
pipeline, 5 messaging, 3 metadata, 2 storage, 2 search, 2 mlmodel, 2 drive,
2 mcp, 1 api.

## Connectors

Product `source.type` registry: `connectors/registry.py` `load_builtin_sources()`.

| `source.type` | Catalog mapping | Status | Evidence |
|---|---|---|---|
| `postgres` | DatabaseService Postgres | Shipped (Phase 6) | `connectors/postgres.py` |
| `mysql` | DatabaseService Mysql | Shipped (Phase 7) | `connectors/mysql.py` |
| `kafka` | MessagingService Kafka | Shipped (Phase 7) | `connectors/kafka.py` |
| `snowflake` | DatabaseService Snowflake | Shipped (Phase 7) | `connectors/snowflake.py` |

**Gap (102 official `service_spec.py` families):** every other official
connector is absent. Phase 7 explicitly deferred filesystem/object storage,
dashboards, BigQuery, Redshift, Databricks, Airflow, profiler/DQ execution.

Official database `service_spec` parents (52): athena, azuresql, bigquery,
bigtable, burstiq, cassandra, clickhouse, clickzetta, cockroach, couchbase,
data360, databend, databricks, datalake, db2, dbt, domodatabase, doris,
druid, dynamodb, exasol, glue, greenplum, hive, impala, iomete, mariadb,
mongodb, mssql, my_db, mysql, neo4j, oracle, pinotdb, postgres, presto,
query, questdb, redshift, salesforce, saperp, saphana, sas, singlestore,
snowflake, sqlite, starrocks, teradata, timescale, trino, unitycatalog,
vertica.

Do **not** copy `ingestion/`. A production-correct connector wraps a mature
OSS client, maps to Apache `openmetadata-service` REST, and has tests against
the documented catalog contract. Which one is next is a **Bernie question**.

## UI major areas

Official console is `openmetadata-ui/` (React + core-components, CCL,
reference-only). Product console is `smartmetadata-ui/` (Vue 3).

| Area | Official (reference) | Product | Status |
|---|---|---|---|
| Login / session | `LoginPage` | `LoginView.vue` | Shipped (P1); zh-CN/en-US chrome + locale switcher in UI parity batch 1 |
| Search / catalog | Explore | `SearchView.vue` + `AssetDetailView.vue` | Shipped (P1); **shell/nav/i18n** in Phase A; **Explore facets/cards + asset tabs** in Phase B (`UI_PARITY_BATCH1.md`); **non-table shells + pipeline DAG** in batch 2 step 5 (`UI_PARITY_BATCH2_ASSETS_PIPELINE.md`); **chart / metric / dashboardDataModel / database / databaseSchema GETs** in batch 3.2 (`UI_PARITY_BATCH3_ASSETS.md`) |
| Lineage graph | React lineage pages | Vue Flow + dagre `LineageView.vue` + shared `LineageCanvas` | Shipped (P3); **canvas thickening** in UI parity batch 2 (`UI_PARITY_BATCH2_LINEAGE.md`) |
| Admin: users/teams/roles/bots/settings | Settings pages | `views/admin/*` | Shipped (P2); **users / teams / bots / roles** share list+detail chrome (`UI_PARITY_BATCH2_CRUD.md`, `UI_PARITY_BATCH3_CRUD.md`). **Settings hub + topbar user menu** in `UI_PARITY_BATCH2_CHROME.md`. Settings Policies residual (batch 3.4) |
| Governance | Glossary / tags / domains | `views/governance/*` | Shipped (P4); **classifications / glossaries / domains / data products** on the same CRUD shells |
| Quality + incidents/alerts | DataQuality, IncidentManager | `views/quality/*`, `views/observability/*` | Catalog CRUD shipped (P5); list+detail chrome in `UI_PARITY_BATCH3_CRUD.md`; **job execution residual** (`jobs.py` raises `WorkflowError`) |
| Services / pipelines console | AddService / AddIngestion | `views/ingestion/*` | CRUD + CLI YAML shipped (P8); list+detail chrome in `UI_PARITY_BATCH3_CRUD.md`; **no Airflow `/trigger`** (ADR:2026-10-22-ingestion-console-runs-via-cli) |
| Activity / tasks / announcements | Feed | `views/collaboration/*` | Shipped (P9); **persona landing skipped** |
| Data insights / KPI | `DataInsightPage`, `KPIPage` | `InsightsView.vue` + `features/charts/` + `api/kpi.ts` | **Partial**: batch 2 step 4 snapshots + `listChartData`; batch 3.3 (`UI_PARITY_BATCH3_KPI.md`) lists `GET /v1/kpi`. App analytics / KPI CRUD / history charts residual |
| Profiler run UI | `ProfilerConfigurationPage` | Read of stored results only | **Gap** (runner residual) |
| SSO deep config / persona customization | Appearance / Persona pages | Auth-provider-aware login only | **Gap** (P2/P9 residual) |
| Knowledge / Context Center / Ontology Studio | Collate pages | — | **DROP** (Phase 10/11 Collate-only) |

## MCP

Official tools (21): `company_context`, `search_metadata`, `semantic_search`,
`get_entity_details`, `get_persona_context`, `get_user_context`,
`find_context`, `get_concept_context`, `create_entity`,
`describe_entity_type`, `patch_entity`, `get_entity_lineage`,
`create_lineage`, `get_test_definitions`, `create_test_case`,
`root_cause_analysis`, `sparql_query`, `entity_neighborhood`, `find_by_tag`,
`shacl_validate`, `ontology_describe`.

Product tools (7): `search_entities`, `get_table`, `get_topic`, `get_lineage`,
`list_glossaries`, `list_tags`, `create_conversation`.

| Official tool | Product status |
|---|---|
| Keyword search | Shipped as `search_entities` (`GET /v1/search/query`) |
| `get_entity_details` | **Subset:** table + topic only |
| `get_entity_lineage` | Shipped as `get_lineage` (FQN GET, depth clamped 0–3) |
| Glossary / tags list | Shipped |
| `create_conversation` | Shipped (OSS Feed, not `/v1/feed`) |
| `create_entity` / `patch_entity` / `create_test_case` / `get_test_definitions` / `create_lineage` / `find_by_tag` | **Gap** (Apache REST exists; not wired in Phase 10) |
| `semantic_search`, persona/user/company/concept context, NLQ | **DROP** (Phase 10 non-goal: Collate AI) |
| `sparql_query`, `entity_neighborhood`, `shacl_validate`, `ontology_describe`, `root_cause_analysis` | **DROP** (Phase 10: RDF / Collate) |
| HTTP `/mcp` on the Java server | **Unregistered** (slim dist has no CCL jar) |

## Ingestion framework

| Capability | Official (reference) | Product | Status |
|---|---|---|---|
| Source→Sink runner | `ingestion/` workflow | `smartmetadata_ingestion/runner.py` | Shipped (P6) |
| REST sink | metadata REST | `sinks/metadata_rest.py` | Shipped |
| Connector registry | `service_spec.py` + entry points | in-process `register_source` | Shipped (P7); **no setuptools plugins** |
| Airflow / Prefect operator | `openmetadata-airflow-apis` (Python headers point at CCL `ingestion/LICENSE`) | — | **Gap**; Phase 11: “later ADR”. Console runs via CLI |
| Profiler / DQ execution | official pipelines | `jobs.py` stubs that **raise** | **Residual, not shipped.** Do not pretend they run |
| Sample-data loader | official | seed via API or `smartmetadata-ingest` | **Gap** vs one-click sample stack |

## License strategy (what OSS to reuse)

Product trees (`smartmetadata-*`, slim `openmetadata-dist`) stay Apache-2.0.
New dependencies: **Apache-2.0, MIT, or BSD-2/3 only**. Do not copy CCL
source from `ingestion/`, `openmetadata-ui/`, or `openmetadata-mcp/`. Borrow
*approaches* (REST paths, `information_schema` shape, service entity types)
from those trees.

Already shipped extras (Phase 6–7; do not re-litigate here):

| Extra | Library | Notes |
|---|---|---|
| (core) | `httpx`, `pydantic`, `pyyaml` | HTTP + config |
| `postgres` | `psycopg[binary]` | Already in product |
| `mysql` | `pymysql` | Already in product |
| `snowflake` | `snowflake-connector-python` | Already in product |
| `kafka` | `kafka-python` | Live AdminClient fallback; discovery is HTTP |

**Candidates for a later batch — SPDX must be re-checked on the exact
package version before adding, and Bernie must confirm the service type.**
Do not treat this list as an implementation order:

| Possible official surface | Mature client often used | Why it is still a question |
|---|---|---|
| BigQuery | `google-cloud-bigquery` | Auth surface (ADC vs key file) and catalog mapping not decided |
| Redshift | existing `psycopg` extra | Warehouse SQL dialect / `information_schema` differences vs Postgres |
| S3 / GCS | `boto3` / `google-cloud-storage` | Needs Container entity + sink path (Phase 7 skipped) |
| Databricks | vendor SQL connector | Service type (database vs pipeline vs unitycatalog) is ambiguous |
| Superset / Metabase | HTTP + their OSS clients | Dashboard entity + auth; extra HTTP surface |
| Airflow operator | Apache Airflow itself (Apache-2.0) | `openmetadata-airflow-apis` headers are CCL-tainted; wrapping Airflow without copying that package needs an ADR |

LGPL (e.g. some database drivers) is **not** in the allowed set for **new**
extras until Bernie says otherwise. `psycopg` is already shipped.

## What this change implements vs documents

- **Implemented in the same PR as this file:** CI/label hygiene so product
  PRs can pass without fake issue links
  (ADR:2026-10-22-smartmetadata-prs-skip-collate-issue-and-label-gates).
- **Not implemented (stopped for Bernie):** any new connector, UI area, MCP
  tool, profiler/DQ runner, or Airflow/Prefect operator. Implementing one
  without a confirmed service type / library / mapping would be inventing
  scope or shipping a stub.

## Questions for Bernie (blocking the first production-correct batch)

1. **Which surface is batch 1?** **Answered 2026-10-25:** UI chrome first
   (AppShell / nav / density + zh-CN/en-US) as Phase A. **Phase B** (this
   follow-up) deepens Explore/search + asset-detail tabs. See
   `UI_PARITY_BATCH1.md`.
2. **If connector:** which `source.type` / official family, and which OSS
   client+version to wrap? How should it map to Apache catalog entities
   (especially Databricks / Unity Catalog / datalake vs table)?
3. **If UI (after shell):** Insights/KPI, first-class non-table assets,
   profiler **run** UI, or SSO/persona? Persona landing and Collate AI widgets
   stay DROP unless you reverse Phase 9/11. Explore/asset deepening is
   Phase B in `UI_PARITY_BATCH1.md`. Lineage canvas is batch 2 step 1
   (`UI_PARITY_BATCH2_LINEAGE.md`). Shared list+detail CRUD chrome is
   batch 2 step 2 (`UI_PARITY_BATCH2_CRUD.md`). Topbar + Settings hub is
   batch 2 step 3 (`UI_PARITY_BATCH2_CHROME.md`). Insights + profile
   charts are batch 2 step 4 (`UI_PARITY_BATCH2_CHARTS.md`). Non-table
   asset shells + pipeline DAG are batch 2 step 5
   (`UI_PARITY_BATCH2_ASSETS_PIPELINE.md`). Chart / metric /
   dashboardDataModel / database / databaseSchema detail GETs are batch
   3.2 (`UI_PARITY_BATCH3_ASSETS.md`). Insights KPI `GET /v1/kpi` list +
   tab is batch 3.3 (`UI_PARITY_BATCH3_KPI.md`).
4. **If MCP:** wire generic Apache REST tools (`get_entity_details` for more
   entity types, `patch_entity`, `create_test_case`, …) on stdio only, or
   also HTTP/SSE (Phase 10 said no)? RDF/AI tools stay DROP unless you
   reverse Phase 10.
5. **If framework:** profiler/DQ **execution** (today `jobs.py` raises) vs
   an Apache Airflow or Prefect operator vs keep CLI? Phase 11 called
   Airflow/Prefect a later ADR.
6. **License:** confirm Apache-2.0 / MIT / BSD-2/3 only for new extras, and
   whether LGPL drivers are allowed.

Until those are answered, do not add a connector extra, a Vue route, or an
MCP tool that only looks complete.
