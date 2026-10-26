# UI parity batch 2 step 4 — Insights + profile charts

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture.
No CCL React chart source was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

This batch closes the zero-charts gap only. It does **not** start Pipeline
DAG / non-table asset shells (step 5).

## Chart library

| Package | SPDX | Why |
|---|---|---|
| `echarts` 6.x | Apache-2.0 | Tree-shaken line / bar / pie only (`features/charts/register.ts`) |
| `vue-echarts` 8.x | MIT | Vue 3 wrapper around the registered ECharts build |

Shared primitives live in `smartmetadata-ui/src/features/charts/` (`SmChart`,
empty/error states, series mappers). Charts render **only** when a mapper
produced finite points from a GET payload.

## Official IA that this batch follows

Read-only paths (approaches, not source):

| Official surface | Path | Intent borrowed |
|---|---|---|
| Insights page | `pages/DataInsightPage/DataInsightPage.component.tsx` | Top-level Insights route with Data assets / App analytics / KPIs tabs |
| Data-asset charts | `constants/DataInsight.constants.ts` `ENTITIES_CHARTS` | Density: totals, description/owner coverage, tier — **only if series exist** |
| System chart GET | `/v1/analytics/dataInsights/system/charts/listChartData` | Same chart **names** as query params (`total_data_assets`, …) |
| Profiler history | `GET /v1/tables/{fqn}/tableProfile` | Row-count series on the asset Quality tab |
| Usage | `GET /v1/usage/{type}/name/{fqn}` | Daily `dailyStats.count` when present |
| Test results | `GET /v1/dataQuality/testCases/testCaseResults/{fqn}` | Status over time on the test-case page |

Intentionally **not** copied: Recharts/React chart components, Collate
cost-analysis, KPI create/edit, web-analytics websocket stream, fake demo
series.

## What the product had

No Insights route. Nav explicitly omitted `insights`. Asset Quality showed
latest profiler **numbers** and a results **table**. Phase 5 forbade
hardcoded DQ charts.

## Gap closed

| Item | Official (reference) | Product now | Residual |
|---|---|---|---|
| Insights nav / route | Left-nav Insights | `/insights` + `InsightsView` after Lineage | No Home / Marketplace |
| Data assets tab | Pipeline + coverage charts | Live snapshot donut/bar from `GET /v1/search/query` aggregations (entity type, service type, tier) + test/incident status from the first 100 quality GETs | Snapshot, not a warehouse history |
| Pipeline series | `listChartData` after a Data Insights job | Same GET; line charts **only** when `results[]` has counts | Empty residual copy when 404/empty |
| App analytics / KPIs | Own tabs + extra APIs | App analytics tab residual Empty. KPIs tab wired in batch 3.3 (`UI_PARITY_BATCH3_KPI.md`) | No web-analytics index. KPI **CRUD** / history charts still residual |
| Asset profile charts | Profiler / usage widgets | Row-count line (`tableProfile` history), usage line, column-null bar, latest test-status donut | Profiler **run** still residual |
| Test-case chart | Results over time | Bar series from stored `testCaseResults` | Empty until a quality job writes results |
| i18n | Official catalogs | `nav.insights`, `insights.*`, `charts.empty`, `asset.*Chart*` in zh-CN + en-US | Other CRUD pages still mixed English |

No new Java/Python endpoints. No invented numeric points.

## Residual (do not fake)

| Gap | Why it stays |
|---|---|
| Historical Data Insights / KPI **history** charts | Need the Data Insights application and `GET /v1/kpi/{name}/kpiResult`. List/detail from `GET /v1/kpi` is batch 3.3 |
| App analytics (page views, DAU) | Official reads web-analytic report indexes this console does not call |
| Catalog composition as a time series | Search aggregations are a live snapshot; history only from `listChartData` |
| Quality snapshot is page-limited | First 100 test cases / latest incidents, not a global warehouse KPI |
| Profiler / DQ **execution** | `jobs.py` still raises; this UI only reads stored results |
| Pipeline DAG / non-table asset shells | Closed in batch 2 step 5 (`UI_PARITY_BATCH2_ASSETS_PIPELINE.md`) |
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

1. Left nav: Insights between Lineage and Observability.
2. Insights → Data assets: charts appear only for aggregations / statuses
   the APIs returned. Empty catalog → empty states, not demo numbers.
3. Pipeline cards stay residual until `listChartData` has results.
4. App analytics stays residual empty. KPIs: list/detail when
   `GET /v1/kpi` has rows, Empty otherwise (batch 3.3).
5. Open a table → Quality: row-count / usage / column-null / test-status
   charts. Topics get the test-status donut only (no tableProfile).
6. Open a test case: results chart follows `testCaseResults`, empty if none.
