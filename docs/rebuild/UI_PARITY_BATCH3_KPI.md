# UI parity batch 3.3 — Insights KPI client + tab

Holistic Alma gate after #32–#35: **READY_FOR_ALMA**
(`UI_PARITY_BATCH3_HOLISTIC.md`). Residuals in this file stay deferred.

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture.
No CCL React KPI page or chart source was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

Batch 2 step 4 (`UI_PARITY_BATCH2_CHARTS.md`, PR #30) left the Insights
KPIs tab as a residual Empty: no `GET /v1/kpi` client. This pass adds
that client and wires the existing KPIs tab to list / selected-detail /
Empty from real payloads only. It does **not** invent App analytics
charts, fake KPI targets, or a Data Insights job runner.

## Official IA that this batch follows

Read-only paths (approaches, not source):

| Official surface | Path | Intent borrowed |
|---|---|---|
| Insights KPIs tab | `DataInsightPage` + `KPIList` | Same Insights route; KPIs tab lists catalog KPI entities |
| KPI REST | `GET /v1/kpi`, `GET /v1/kpi/name/{name}` | Same collections; default fields `owners,dataInsightChart,kpiResult` |

Intentionally **not** copied: KPI create/edit/delete, `KPIChart` history
series, `KPILatestResultsV1` progress widgets, web-analytics indexes.

## Gap closed

| Item | Official (reference) | Product now | Residual |
|---|---|---|---|
| `GET /v1/kpi` client | `KpiAPI.getListKPIs` | `smartmetadata-ui/src/api/kpi.ts` `listKpis` / `getKpiByName` | No POST/PUT/PATCH/DELETE |
| Insights KPIs tab | `KPIList` table | Table + selected Descriptions from the list payload (or Empty) | No first-class `/kpi` route or write UI |
| Target / current | Stored `targetValue` + `kpiResult.targetResult` | Shown only when those fields are on the GET payload | No invented progress or demo targets |
| App analytics tab | Web-analytics charts | Unchanged residual Empty | No web-analytics index client |

No new Java/Python endpoints. No invented numeric points.

## Residual (do not fake)

| Gap | Why it stays |
|---|---|
| KPI create / edit / delete | Official write APIs exist; this batch is read-only list/detail |
| `GET /v1/kpi/{name}/kpiResult` history charts | Needs a Data Insights job this UI does not start |
| App analytics (page views, DAU) | Official reads web-analytic report indexes this console does not call |
| Settings Policies | Closed in batch 3.4 (`UI_PARITY_BATCH3_SETTINGS.md`) |
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

1. Insights → KPIs: table rows only when `GET /api/v1/kpi` returns
   entities. Empty catalog → Empty, not demo targets.
2. Click a row: Descriptions show that payload (target / current /
   `targetMet` only if present).
3. App analytics tab stays residual Empty.
4. Data assets / pipeline charts are unchanged from batch 2 step 4.
