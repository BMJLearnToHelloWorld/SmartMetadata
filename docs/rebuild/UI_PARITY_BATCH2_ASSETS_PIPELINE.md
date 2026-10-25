# UI parity batch 2 step 5 — non-table asset shells + pipeline DAG

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture.
No CCL React source was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

This is the last continuous surface in batch 2. It does **not** start
holistic review, Alma deploy, or Knowledge / Ontology / AI.

## Official IA that this batch follows

Read-only paths (approaches, not source):

| Official surface | Path | Intent borrowed |
|---|---|---|
| Pipeline detail tabs | `components/Pipeline/PipelineDetails` | Overview + **Tasks** + **Executions** (not a fake extra DAG tab) |
| Task DAG | `components/Pipeline/PipelineTaskTab` | Nodes = `pipeline.tasks`; edges = `downstreamTasks` names that exist |
| Executions | `GET /v1/pipelines/{fqn}/status?startTs&endTs` | History table; latest `pipelineStatus` on the entity GET is enough when the list is empty |
| Dashboard charts | Dashboard entity `charts` / `dataModels` refs | Table of returned refs, not a rendered BI widget |
| ML features | `mlFeatures` / `mlHyperParameters` | Table of returned fields |
| Container / search index schema | `dataModel.columns` / `fields` | Same schema table chrome as table/topic |
| Stored procedure code | `storedProcedureCode` | Language + code, empty residual if absent |

Intentionally **not** copied: `@xyflow/react` TasksDAGView, invented Start/End
nodes, websocket run streaming, Airflow `/trigger`, Chart/Metric standalone
pages, Knowledge / Ontology / AI.

Pipeline canvas reuses **already shipped** MIT `@vue-flow/*` + Apache-2.0
`dagre` (same stack as lineage). Rank direction is TB.

## What the product had

`/assets/:entityType/:fqn` existed for every search hit, but
`DETAIL_ENDPOINTS` only listed `table` and `topic`. Other types showed
`asset.unwired`. Ingestion `/ingestion/pipelines/:id` is a different entity
(Airflow console) and stays CLI-run (ADR:2026-10-22-ingestion-console-runs-via-cli).

## Gap closed

| Item | Official (reference) | Product now | Residual |
|---|---|---|---|
| Shared asset chrome | Entity header + tabs | `AssetDetailView` uses `EntityDetailShell` (breadcrumb, title, FQN, actions, tabs) | Density matches CRUD shells |
| Wired GET types | Per-collection `/v1/{collection}/name/{fqn}` | `table`, `topic`, `dashboard`, `pipeline`, `mlmodel`, `container`, `searchIndex`, `storedProcedure` | `chart`, `metric`, `dashboardDataModel`, … stay unwired |
| Type tabs | Only tabs with a payload | Schema / Charts / Features / Tasks / Executions / Code only for those types | No invented Profiler/Sample tabs on non-table types |
| Pipeline DAG | Tasks tab graph | Vue Flow from `tasks` + `downstreamTasks`; status color from latest `taskStatus` | Empty residual when `tasks` is missing/empty |
| Pipeline executions | Status list | Entity `pipelineStatus` + `GET /v1/pipelines/{fqn}/status` | Empty residual on 404/empty list |
| i18n | Official catalogs | `asset.tabs.tasks`, `asset.tasksEmpty`, … in zh-CN + en-US | Other CRUD pages still mixed English |

No new Java/Python endpoints. No invented DAG nodes or execution rows.

## Residual (do not fake)

| Gap | Why it stays |
|---|---|
| Chart / metric / dashboardDataModel / database / databaseSchema first-class pages | Explore may return them; no slim GET wiring in this step |
| Pipeline run trigger / logs websocket | Slim console does not call `/trigger`; no fake live stream |
| Ingestion pipeline DAG | `/ingestion/pipelines` is the Airflow entity, not catalog `pipeline` |
| Profiler / DQ **execution** | `jobs.py` still raises; Quality tab only reads stored tests |
| Knowledge / Ontology / AI | Collate-only **DROP** |
| Holistic review / Alma deploy | Coordinator-owned; out of this PR |

## How to verify

```bash
cd smartmetadata-ui
npm ci
npm test
npm run build
```

Root: `make ui_test` and `make ui_build`.

Manual (already-running slim server; this PR does not redeploy):

1. Explore a dashboard / pipeline / mlmodel / container / searchIndex /
   storedProcedure hit — card is no longer “unwired”; detail GET loads.
2. Pipeline with `tasks` + `downstreamTasks` → Tasks tab shows those nodes
   only. Pipeline with empty `tasks` → Empty, no demo graph.
3. Executions tab lists `pipelineStatus` / `/status` rows or Empty.
4. Dashboard without `charts`/`dataModels` → Charts Empty.
5. `chart` (or any still-unwired type) still shows residual copy.
