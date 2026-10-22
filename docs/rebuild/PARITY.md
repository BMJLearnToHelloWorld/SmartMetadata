# Capability parity (rebuild vs purged official surfaces)

Evidence captured from this repository **before** the CCL purge
(`origin/main` at `4f4d7f1800`) and from the remaining product trees.
This is **parity with the official OpenMetadata product surfaces the rebuild
replaced**, not new product extensions.

ADR:2026-10-22-ccl-trees-are-purged.

## Connectors

Official `ingestion/src/metadata/ingestion/source/**/service_spec.py`: **106**
files (52 database, 19 dashboard, 16 pipeline, 5 messaging, 3 metadata,
2 storage, 2 search, 2 mlmodel, 2 mcp, 2 drive, 1 api).

Product `smartmetadata-ingestion/src/smartmetadata_ingestion/connectors/`:

| `source.type` | Catalog mapping | Status | Evidence |
|---|---|---|---|
| `postgres` | DatabaseService Postgres | Shipped (Phase 6) | `connectors/postgres.py` |
| `mysql` | DatabaseService Mysql | Shipped (Phase 7) | `connectors/mysql.py` |
| `kafka` | MessagingService Kafka | Shipped (Phase 7) | `connectors/kafka.py` |
| `snowflake` | DatabaseService Snowflake | Shipped (Phase 7) | `connectors/snowflake.py` |

**Gap (102 connectors):** every other official `service_spec.py` family is
absent. Phase 7 explicitly deferred filesystem/object storage, dashboards,
BigQuery, Redshift, Databricks, Airflow, profiler/DQ execution. Those remain
deferred: implementing them here would be a new connector batch, not a
tree-purify fix, and must not copy `ingestion/`.

Registry: `connectors/registry.py` `load_builtin_sources()`.

## UI major areas

Official console was `openmetadata-ui/` (React + core-components, CCL).
Product console is `smartmetadata-ui/src/router/index.ts`.

| Area | Official (purged) | Product | Status |
|---|---|---|---|
| Login / session | React SPA | `LoginView.vue` | Shipped (P1) |
| Search / catalog | Explore | `SearchView.vue` + table/topic `AssetDetailView.vue` | Shipped (P1); dashboards/pipelines/ML/API assets as first-class browse pages not added |
| Lineage graph | React Flow / similar | Vue Flow + dagre `LineageView.vue` | Shipped (P3) |
| Admin: users/teams/roles/bots/settings | Settings | `views/admin/*` | Shipped (P2) |
| Governance: glossary/tags/domains/data products | Governance | `views/governance/*` | Shipped (P4) |
| Quality: tests/suites + incidents/alerts | Observability | `views/quality/*`, `views/observability/*` | Catalog CRUD shipped (P5); **job execution residual** |
| Services / pipelines console | Ingestion | `views/ingestion/*` | CRUD + CLI YAML shipped (P8); **no Airflow `/trigger`** |
| Activity / tasks / announcements | Feed | `views/collaboration/*` | Shipped (P9); **persona landing skipped** |
| Data insights / KPI dashboards | Insights | — | **Gap** |
| Profiler run UI | Profiler | Read of stored results only | **Gap** (runner residual) |
| SSO deep config / persona customization | Settings + landing | Auth-provider-aware login only | **Gap** (P2/P9 residual) |

## MCP

Official `openmetadata-mcp/.../mcp/tools.json`: **21** tools
(`company_context`, `search_metadata`, `semantic_search`, `get_entity_details`,
`get_persona_context`, `get_user_context`, `find_context`,
`get_concept_context`, `create_entity`, `describe_entity_type`, `patch_entity`,
`get_entity_lineage`, `create_lineage`, `get_test_definitions`,
`create_test_case`, `root_cause_analysis`, `sparql_query`,
`entity_neighborhood`, `find_by_tag`, `shacl_validate`, `ontology_describe`).

Product `smartmetadata-mcp/src/tools.ts` `TOOL_NAMES`: **7** OSS REST tools.

| Tool | Status |
|---|---|
| `search_entities` | Shipped (maps official search) |
| `get_table` / `get_topic` | Shipped (subset of `get_entity_details`) |
| `get_lineage` | Shipped (subset of `get_entity_lineage`) |
| `list_glossaries` / `list_tags` | Shipped |
| `create_conversation` | Shipped |
| Collate AI / RDF / ontology / persona / NLQ tools | **DROP** (Phase 10 non-goal) |
| HTTP `/mcp` on the Java server | **Unregistered** (slim dist has no CCL jar) |
| Generic `create_entity` / `patch_entity` / test-case tools | **Gap** (OSS REST; not implemented in Phase 10) |

## Ingestion framework

| Capability | Official (purged) | Product | Status |
|---|---|---|---|
| Source→Sink runner | `ingestion/` workflow | `smartmetadata_ingestion/runner.py` | Shipped (P6) |
| REST sink | `metadata_rest` | `sinks/metadata_rest.py` | Shipped |
| Connector registry | `service_spec.py` + entry points | in-process `register_source` | Shipped (P7); **no setuptools plugins** |
| Airflow / Prefect operator | `openmetadata-airflow-apis` (CCL-tainted) | — | **Gap** (console runs via CLI) |
| Profiler / auto-classification / usage | official pipelines | stubs / not executed | **Gap** |
| Sample-data loader | official | seed via API or `smartmetadata-ingest` | **Gap** vs one-click sample stack |

## What this PR implements vs documents

- **Implemented:** delete CCL trees; reactor/Makefile/Docker/docs/gates so the
  remaining tree is the product; fail if purged paths return.
- **Not implemented here (labeled gaps):** 102 extra connectors, Airflow
  operator, HTTP MCP, Insights UI, profiler execution. Those were Phase 7/10/11
  residuals, not tree-purify work.
