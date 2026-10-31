# Capability ledger (stage 0) — after backend #49–#58

Factual inventory of Apache-facing capabilities vs product status on
`main` tip **`941b5cab22`** (PR [#58](https://github.com/BMJLearnToHelloWorld/SmartMetadata/pull/58)).

This file is an **inventory**, not a license to invent a batch. Status
words only: **Missing | Partial | BehaviorMatched | IntegrationVerified |
ProductVerified**. Collate AI/RDF and other OutOfScope items are **not debt**
unless scope is expanded in writing.

Authority: official OpenMetadata (Apache) REST + docs; evidence in
`BACKEND_01_REVIEW.md` … `BACKEND_10_REVIEW.md` and `PARITY.md`.
Rebuild trees are product evidence, not a second authority.

## How to read

| Column | Meaning |
|---|---|
| Capability | What the product surface does |
| Apache contract | Path / behavior aligned to |
| Product | Where it lives in SmartMetadata |
| Status | Vocabulary above |
| Evidence | PR / REVIEW / test |
| Notes | Partial reason or OutOfScope pointer |

---

## 1. Ingestion metadata runtime (backend-01 · #49)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| MetadataWorkflow lifecycle | Official workflow prepare/run/close | `smartmetadata-ingestion` MetadataWorkflow | BehaviorMatched (unit) | #49 `BACKEND_01_REVIEW` | — |
| MySQL `databaseName` | Apache MySQL source config | MySQL connector config | BehaviorMatched (unit) | #49 | — |
| Kafka Schema Registry 404-only | Official SR error classification | Kafka connector | BehaviorMatched (unit) | #49 | — |
| Source/Processor prepare\|close | Official hooks | Source/Processor base | BehaviorMatched (unit) | #49 | — |
| CLI stack_trace | Official CLI error surface | ingest CLI | BehaviorMatched (unit) | #49 | — |

## 2. Pipeline status writeback (backend-02 · #50)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| Optional `ingestionPipelineFqn` | Pipeline status association | RestClient / workflow | BehaviorMatched (unit) | #50 `BACKEND_02_REVIEW` | — |
| `add_pipeline_status` | `POST/PUT` pipeline status | RestClient | BehaviorMatched (unit) | #50 | Locked by #58 harness |
| running → final writeback | Official status progression | workflow writeback | BehaviorMatched (unit) | #50 | soft-fail |

## 3. Topology / bulk / stale (backend-03 · #51)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| Topology `STAGE_ORDER` | Parent-before-child stages | topology stage order | BehaviorMatched (unit/static) | #51 / #58 | harness locks ranks |
| BulkMetadataRestSink default `useBulk` | Official bulk sink | Bulk sink | BehaviorMatched (unit/static) | #51 / #58 | — |
| SeenSet + deleteStale soft-fail | Stale reconcile | topology | BehaviorMatched (unit) | #51 | — |
| Lineage-before flush | Flush before lineage stage | topology | BehaviorMatched (unit) | #51 | — |

## 4. Lineage / usage (backend-04 · #52)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| LineageDetails `columnsLineage` / pipeline | Lineage PUT details | RestClient / models | BehaviorMatched (unit/static) | #52 / #58 | — |
| Usage DailyCount | `PUT /v1/usage` | RestClient | BehaviorMatched (unit/static) | #52 / #58 | — |
| `delete_lineage_by_name` client | Official delete-by-name | RestClient | BehaviorMatched (unit) | #52 | — |
| Query-log invent | — | — | OutOfScope | #52 | not invented |
| Lineage canvas UI write | Existing lineage PUT (`put_lineage` / MCP `create_lineage`) | Vue canvas connect -> PUT | BehaviorMatched (unit) | partial-lineage-canvas-write / `PARTIAL_LINEAGE_CANVAS_REVIEW.md` | delete API helper only; no delete UI invent |

## 5. Profiler / quality writes (backend-05 · #53)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| EntityProfile write | Profile REST | RestClient | BehaviorMatched (unit/static) | #53 / #58 | — |
| TestCaseResult write | DQ result REST | RestClient | BehaviorMatched (unit/static) | #53 / #58 | — |
| Profiler / DQ **execution** | Official runner pipelines | `jobs.py` raises | Partial / Gap | PARITY | do not pretend they run |
| Profiler run UI | ProfilerConfigurationPage | read stored results only | Gap | PARITY | residual |

## 6. Classification / Tag / App / dbt (backend-06 · #54)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| Classification / Tag write | `PUT /v1/classifications`, `/v1/tags` | RestClient | BehaviorMatched (unit/static) | #54 / #58 | — |
| App write contract | `PUT /v1/apps` | RestClient | BehaviorMatched (unit/static) | #54 / #58 | — |
| dbt full parser | Official dbt ingestion parser | product | Partial | #54 | intentionally not invented |

## 7. Airflow APIs (backend-07 · #55)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| AirflowRESTClient route catalog | Java client prefixes/endpoints | `smartmetadata-airflow-apis` | BehaviorMatched (unit/static) | #55 / #58 | — |
| MemoryDagStore | In-memory DAG store | package | Partial | #55 | no real scheduler / plugin wheel |
| Production Airflow plugin packaging | Official operator packaging | — | Partial / Gap | #55 / PARITY | — |

## 8. MCP (backend-08 · #56)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| 14 Apache-backed tools | search / entity / lineage / tags / DQ defs / conversation / writes | `smartmetadata-mcp` | BehaviorMatched (unit/static) | #56 / #58 / Partial MCP writes | TOOL_NAMES locked |
| `create_entity` / `patch_entity` / `create_test_case` | Apache write REST (POST/PATCH/CreateTestCase) | MCP | BehaviorMatched (unit) | Partial MCP writes | not ProductVerified |
| Collate AI MCP tools | semantic_search, persona/context, NLQ | — | OutOfScope | #56 / PARITY DROP | not debt |
| RDF / KG MCP tools | sparql / shacl / ontology / neighborhood / RCA | — | OutOfScope | #56 / PARITY DROP | not debt |
| Java `/mcp` on slim server | CCL jar registration | unregistered | OutOfScope (intentional) | #56 | slim stays jar-free |

## 9. Settings / UI (backend-09 · #57)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| Policies POST/PUT/DELETE | `/v1/policies` | Vue + api/policies | BehaviorMatched (unit/static) | #57 / #58 | — |
| CP definition add/update | `PUT /v1/metadata/types/{id}` | Vue + customProperties | BehaviorMatched (unit/static) | #57 / #58 | asset values tab unchanged |
| Apps list + detail | `GET /v1/apps` (+`/{id}`) | AppsList/Detail + hub route | BehaviorMatched (unit/static) | #57 / #58 | no marketplace invent |
| Apps marketplace install/trigger | Collate Apps UX | — | OutOfScope | #57 | — |
| SSO deep config / Persona / Appearance invent | official forms | residual hub text | OutOfScope / Gap | #57 / PARITY | not invent |
| Inbox websocket / admins / online-users / audit invent | various | residual | OutOfScope / residual | #57 | — |

## 10. Apache positive regression (backend-10 · #58)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| Offline contract harness | Paths/constants claimed in #49–#57 | `check_apache_positive_regression.py` + verify-rebuild | BehaviorMatched (static/unit) | #58 `BACKEND_10_REVIEW` | not ProductVerified |
| Live catalog / Job C e2e | live HTTP | — | OutOfScope this gate | ADR offline verify | — |

## 11. Connectors & sample data (PARITY; not a fused backend node)

| Capability | Apache contract | Product | Status | Evidence | Notes |
|---|---|---|---|---|---|
| postgres / mysql / kafka / snowflake | Official service types | `smartmetadata-ingestion` connectors | BehaviorMatched / Shipped | PARITY Phase 6-7 | - |
| Databricks (full chain) | OM `database/databricks` service_spec | `databricks` + lineage/usage/profiler/DQ/data_diff + UI tile | BehaviorMatched (unit) | CONNECTOR_DATABRICKS_UC_PLAN.md; tests | OSS locked Bernie t210u; live Usage aggregation Partial until CursorUsageReader IntegrationVerified |
| Unity Catalog (full chain) | OM `database/unitycatalog` service_spec | `unitycatalog` + lineage/usage/profiler/DQ/data_diff + UI tile | BehaviorMatched (unit) | same plan + tests | Separate tile; includeMetricViews; same OSS |
| Doris (full chain) | OM `database/doris` service_spec (metadata+lineage+connection; schema supportsProfiler) | `doris` + lineage/profiler/DQ + UI tile | BehaviorMatched (unit) | CONNECTOR_DORIS_MSSQL_PLAN.md; tests | No invent Usage/DataDiff/sampler_class; OSS pydoris==1.2.0 + PyMySQL live; job execution Partial |
| MSSQL (full chain) | OM `database/mssql` service_spec (metadata+lineage+usage+sampler+data_diff+connection) | `mssql` + lineage/usage/profiler/sampler/DQ/data_diff + UI tile | BehaviorMatched (unit) | CONNECTOR_DORIS_MSSQL_PLAN.md; tests | OSS sqlalchemy-pytds~=1.0 (+ optional pyodbc/pymssql); no collate-data-diff; live Cursor* IntegrationVerified deferred |
| Redshift (full chain) | OM `database/redshift` service_spec (metadata+lineage+usage+profiler+connection) | `redshift` + lineage/usage/profiler/DQ + UI tile | BehaviorMatched (unit) | CONNECTOR_DATABASE_P0_PLAN.md; tests | OSS sqlalchemy-redshift~=1.0.0 + psycopg2-binary + GeoAlchemy2; no collate-data-diff; live Cursor* deferred |
| MariaDB (full chain) | OM `database/mariadb` service_spec (metadata+lineage+profiler+connection) | `mariadb` + lineage/profiler/DQ + UI tile | BehaviorMatched (unit) | CONNECTOR_DATABASE_P0_PLAN.md; tests | OSS PyMySQL; no Usage invent; job execution Partial |
| Greenplum (full chain) | OM `database/greenplum` service_spec (metadata+lineage+connection; schema supportsProfiler) | `greenplum` + lineage/profiler/DQ + UI tile | BehaviorMatched (unit) | CONNECTOR_DATABASE_P0_PLAN.md; tests | OSS COMMONS postgres; no Usage invent |
| Timescale (full chain) | OM `database/timescale` service_spec (metadata+lineage+usage+sampler+connection) | `timescale` + lineage/usage/profiler/sampler/DQ + UI tile | BehaviorMatched (unit) | CONNECTOR_DATABASE_P0_PLAN.md; tests | OSS postgres-family; no data_diff invent; live Cursor* deferred |
| Superset (full chain) | OM `dashboard/superset` BaseSpec (metadata+connection; API mode) | `superset` + dashboardService/chart/dashboard + UI | BehaviorMatched (unit) | Dashboard P0 | DB connection oneOf deferred; no lineage/usage invent |
| Metabase (full chain) | OM `dashboard/metabase` BaseSpec (metadata+connection) | `metabase` + dashboardService/chart/dashboard + UI | BehaviorMatched (unit) | Dashboard P0 | live IntegrationVerified deferred |
| S3 (full chain) | OM `storage/s3` BaseSpec (metadata+sampler+connection; schema awsConfig required) | `s3` + storageService/container + UI tile + sampler registration | BehaviorMatched (unit); live boto3 Partial | Storage S3 P0 | live IntegrationVerified deferred |
| Redpanda (full chain) | OM `messaging/redpanda` BaseSpec (metadata+sampler+connection; schema bootstrapServers required) | `redpanda` + messagingService/topic + UI tile + sampler registration | BehaviorMatched (unit); live consumer Partial | Messaging Redpanda P0 | live IntegrationVerified deferred |
| Prefect (full chain) | OM `pipeline/prefect` BaseSpec (metadata+connection; schema hostPort+authType required) | `prefect` + pipelineService/pipeline + UI tile | BehaviorMatched (unit); live HTTP Partial | Pipeline P0 | live IntegrationVerified deferred |
| Dagster (full chain) | OM `pipeline/dagster` BaseSpec (metadata+connection; schema host required) | `dagster` + pipelineService/pipeline + UI tile | BehaviorMatched (unit); live GraphQL/`dagster_graphql` Partial | Pipeline P0 | live IntegrationVerified deferred |
| ~100 other official connectors | `service_spec.py` families | absent | Gap / Missing | PARITY | **do not invent sprawl as next batch without written scope** |
| Sample-data one-click | official sample stack | seed via API / ingest | Gap | PARITY | — |

## 12. UI residuals (PARITY; not invent)

| Capability | Status | Notes |
|---|---|---|
| Insights KPI CRUD | BehaviorMatched (unit) | `api/kpi.ts` POST/PUT/PATCH/DELETE + result GETs; `PARTIAL_KPI_CRUD_REVIEW.md` |
| Insights KPI history **charts** / app analytics | Partial / OutOfScope invent | result GET helpers exist; chart UI + web-analytics residual |
| Profiler run UI | Gap | runner residual |
| SSO / Persona / Appearance | Gap / OutOfScope invent | residual tiles |
| Knowledge / Ontology / AI / Context Center | DROP / OutOfScope | Collate-only |

---

## OutOfScope (not debt)

- Collate AI / NLQ / persona context MCP tools
- RDF / SPARQL / SHACL / ontology MCP tools
- SSO deep config / Persona landing / Appearance invent save forms
- Apps marketplace install/trigger UX
- Connector sprawl (~102) as an unscoped “must finish next”
- #18 purge branch as merged reality
- Copying CCL React / `openmetadata-mcp` / CCL airflow-apis
- Marking anything ProductVerified / IntegrationVerified without live proof

## Partial (honest leftovers)

- Airflow MemoryDagStore / real scheduler / plugin wheel
- dbt full parser
- ~~MCP `create_entity` / `patch_entity` / `create_test_case`~~ → BehaviorMatched (unit); see Partial MCP writes
- Profiler/DQ **execution** (`jobs.py` raises)
- ~~Insights KPI CRUD beyond list~~ → BehaviorMatched (unit); see `PARTIAL_KPI_CRUD_REVIEW.md` (history charts / app analytics / write UI still residual or OutOfScope)
- Live IntegrationVerified / ProductVerified for #49–#58 claims

## Next (optional; require written scope)

- (done) MCP write tools without inventing payloads — BehaviorMatched unit
- (done) Insights KPI CRUD client — BehaviorMatched unit
- Profiler/DQ execution ADR
- (done 2026-10-30) Databricks + Unity Catalog full chain after Bernie t210u named type + OSS
- Further connector families **only after Bernie names type + OSS client**
- Alma tip: Dockerfile ARG fix on main `1f737fb` (#63); product stack was @ `bed0b267` + local hot-fix before that merge

## Pointers

- Matrix / stop-list: [PARITY.md](./PARITY.md)
- Per-slice reviews: `BACKEND_01_REVIEW.md` … `BACKEND_10_REVIEW.md`
- Product run path: [PRODUCT_PATH.md](./PRODUCT_PATH.md)

- (done 2026-10-30) Doris + MSSQL full chain after Bernie t215u named types + OSS lock
- (done 2026-10-30) Database P0 Redshift/MariaDB/Greenplum/Timescale full chain after Bernie t219u
- (shipped 2026-11-01) Storage S3 P0 full chain after Bernie t225u
- (shipped 2026-11-01) Messaging Redpanda P0 full chain after Bernie t225u
- (shipped 2026-11-01) Pipeline P0 Prefect+Dagster full chain after Bernie t225u; next leftovers other messaging/pipeline tiles
