# Self-review notes (parent COMMENT)

## Anti-drift table

| Claim | Contract evidence | Invent risk |
|---|---|---|
| createKpi POST | `KpiResource.create` + `createKpiRequest.json` requireds/enum | None — body typed to schema |
| updateKpi PUT | `KpiResource.createOrUpdate` | None |
| patchKpi / patchKpiByName | `KpiResource` PATCH id + name; product EditKPIPage uses id PATCH | None — RFC 6902 only |
| deleteKpi / deleteKpiByName | `KpiResource` DELETE; product hard-delete via entity util | None — hardDelete query passthrough |
| listKpiResults / getLatestKpiResult | Apache GETs; product `getListKpiResult` / `getLatestKpiResult` | Points mapped only when present; no chart invent |
| Insights tab write UI | — | Explicitly OutOfScope (no rebuild) |
| App analytics | — | OutOfScope Collate residual |

## What this is not

- Not ProductVerified
- Not IntegrationVerified (no live Alma call in this PR)
- Not a KPI create/edit page

## Suggested COMMENT body

Partial #3 Insights KPI CRUD: BehaviorMatched (unit) for Apache
`/v1/kpi` create/update/patch/delete + kpiResult/latest helpers on the
existing list client. No Insights write UI / history-chart / app-analytics
invent. Review: `docs/rebuild/PARTIAL_KPI_CRUD_REVIEW.md`.
