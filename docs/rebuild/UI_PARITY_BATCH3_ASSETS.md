# UI parity batch 3.2 — remaining catalog asset detail GETs

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture.
No CCL React source was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

Batch 2 step 5 (`UI_PARITY_BATCH2_ASSETS_PIPELINE.md`, PR #31) wired
dashboard / pipeline / mlmodel / container / searchIndex / storedProcedure.
Explore could still return `chart`, `metric`, `dashboardDataModel`,
`database`, and `databaseSchema` as unwired. This pass adds those five
slim GETs. It does **not** start Settings Policies (3.4), App analytics,
profiler/DQ execution, pipeline trigger, or DROP Knowledge / Ontology /
AI. KPI list/detail is batch 3.3 (`UI_PARITY_BATCH3_KPI.md`).

## Official collections used (no invented paths)

| Explore `entityType` | GET | Type tab (payload only) |
|---|---|---|
| `chart` | `/v1/charts/name/{fqn}` | Overview + shared tail. `chartType` / `sourceUrl` / `service` on Overview. `dashboards` refs as Related assets (Empty if absent). No BI widget. |
| `metric` | `/v1/metrics/name/{fqn}` | **Code** from `metricExpression` (same chrome as stored procedure). Overview: `metricType`, `unitOfMeasurement`, `granularity`. |
| `dashboardDataModel` | `/v1/dashboard/datamodels/name/{fqn}` | **Schema** from `columns`. Overview: `dataModelType`, `project`, `service`. |
| `database` | `/v1/databases/name/{fqn}` | Overview + `databaseSchemas` refs. Empty residual when the list is missing. |
| `databaseSchema` | `/v1/databaseSchemas/name/{fqn}` | Overview + `tables` refs. Empty residual when the list is missing. |

Shared tail is unchanged from #31: Lineage / Quality / Activity / Custom
properties. Empty fields render Empty / `—`. No demo rows.

PATCH still uses `/v1/{collection}/{id}` from the same map (including
`/v1/dashboard/datamodels/{id}`).

## Wired vs residual

**Wired after this pass** (Explore → `/assets/:entityType/:fqn` loads):

`table`, `topic`, `dashboard`, `pipeline`, `mlmodel`, `container`,
`searchIndex`, `storedProcedure`, `chart`, `metric`, `dashboardDataModel`,
`database`, `databaseSchema`.

**Still residual (do not invent):**

| Gap | Why it stays |
|---|---|
| `query`, `apiCollection`, `apiEndpoint`, `dataContract`, drive/file/spreadsheet/worksheet, `report` | Known Apache collections exist, but this batch only named the five Explore leftovers from #31 |
| KPI Insights tab (`GET /v1/kpi`) | Closed in batch 3.3 (`UI_PARITY_BATCH3_KPI.md`). KPI CRUD / history charts still residual |
| Settings Policies | Batch 3.4 |
| App analytics / `listChartData` extras | Insights residual from batch 2 step 4 |
| Chart **widget** render | Slim GET only; no embedded BI |
| Pipeline `/trigger` / logs websocket | Slim console does not call them |
| Profiler / DQ **execution** | `jobs.py` still raises |
| Knowledge / Ontology / AI | Collate-only **DROP** |

## How to verify

```bash
cd smartmetadata-ui
npm ci
npm test
npm run build
```

Root: `make ui_test` and `make ui_build`.

Manual (already-running slim server; this PR does not redeploy):

1. Explore a `chart` / `metric` / `dashboardDataModel` / `database` /
   `databaseSchema` hit — card is no longer “unwired”; detail GET loads.
2. Metric without `metricExpression` → Code Empty. Data model without
   `columns` → Schema Empty. Database without `databaseSchemas` → Related
   Empty.
3. `query` (or any still-unwired type) still shows residual copy.
4. Dashboard Charts tab still lists refs; it does not render a widget.
