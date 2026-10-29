## Summary

Close Partial **Insights KPI CRUD beyond list** as 1:1 Apache `/v1/kpi`
client helpers on `smartmetadata-ui` (create / update / patch / delete +
result GETs already expected by product `KpiAPI`). Extends batch 3.3 list
client; does **not** invent Add/Edit KPI pages, history charts, or app
analytics.

## Status

**BehaviorMatched (unit)**. Not ProductVerified.

## Evidence

- `smartmetadata-ui/src/api/kpi.ts` + `kpi.test.ts`
- `smartmetadata-ui/src/types/kpi.ts` (`CreateKpiRequest`)
- `docs/rebuild/PARTIAL_KPI_CRUD_REVIEW.md`
- Ledger / PARITY Partial strike

## Test plan

- [x] `cd smartmetadata-ui && npm test -- src/api/kpi.test.ts`
- [ ] CI verify-rebuild / harness
- [ ] Manual (optional, already-running server): POST/PATCH/DELETE via client
      against live `/api/v1/kpi` — not required for this Partial status

## Out of scope

- Alma tip upgrade
- Insights write UI / history charts
- Collate app analytics
