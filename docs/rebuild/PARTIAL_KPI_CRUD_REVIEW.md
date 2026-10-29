# Partial close #3 — Insights KPI CRUD

Branch: `rebuild/partial-kpi-crud`

## Scope

Close CAPABILITY_LEDGER Partial **"Insights KPI CRUD beyond list"** as
**1:1 Apache REST** on the existing `smartmetadata-ui` KPI client (batch 3.3
list/detail). No Collate app-analytics invent, no history-chart UI invent,
no Add/Edit KPI page rebuild, no Data Insights job runner.

## Contracts

| Client helper | Apache REST | Product surface (reference) |
|---|---|---|
| `listKpis` / `getKpiByName` / `getKpiById` | `GET /v1/kpi`, `/name/{name}`, `/{id}` | `getListKPIs` / `getKPIByName` (+ id GET on resource) |
| `createKpi` | `POST /v1/kpi` CreateKpiRequest | `postKPI` / AddKPIPage |
| `updateKpi` | `PUT /v1/kpi` createOrUpdate | Apache `createOrUpdateKpi` (product edit uses PATCH) |
| `patchKpi` / `patchKpiByName` | `PATCH /v1/kpi/{id}` / `PATCH /v1/kpi/name/{fqn}` RFC 6902 | `patchKPI` / EditKPIPage |
| `deleteKpi` / `deleteKpiByName` | `DELETE /v1/kpi/{id}` / `DELETE /v1/kpi/name/{name}` | KPIList `hardDeleteEntity` |
| `listKpiResults` | `GET /v1/kpi/{name}/kpiResult` | `getListKpiResult` |
| `getLatestKpiResult` | `GET /v1/kpi/{name}/latestKpiResult` | `getLatestKpiResult` |

Create body required fields match
`openmetadata-spec/.../createKpiRequest.json`: `name`, `description`,
`dataInsightChart` (Apache enum), `startDate`, `endDate`, `targetValue`,
`metricType`. Optional: `displayName`, `owners`, `domains`.

Default list/detail fields stay `owners,dataInsightChart,kpiResult`
(`KpiResource.FIELDS`).

## Explicit non-goals

- AddKPIPage / EditKPIPage / first-class `/kpi` write routes (would rebuild Insights)
- History **charts** / progress widgets / invented numeric series
- App analytics / web-analytics indexes (Collate residual)
- Async delete / restore helpers (Apache exists; product UI does not call them)
- ProductVerified / live IntegrationVerified
- Alma deploy

## Status

**BehaviorMatched (unit)** for KPI entity CRUD + result GET helpers.
Not ProductVerified. Insights KPIs tab remains list/selected-detail UI;
write UI is OutOfScope invent until a later scoped batch.

## Anti-drift

| Item | Contract | Invent? |
|---|---|---|
| POST/PUT CreateKpiRequest | Apache schema enum + requireds | No |
| PATCH json-patch | RFC 6902 + `application/json-patch+json` | No |
| DELETE hardDelete query | Apache query defaults | No |
| kpiResult / latestKpiResult | Official GET; map points only when present | No |
| History chart / Add form | — | OutOfScope |

## Tests

```bash
cd smartmetadata-ui
npm test -- src/api/kpi.test.ts
```
