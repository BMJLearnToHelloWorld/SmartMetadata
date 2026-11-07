# Data-insights service cards read the system charts, summary cards and absolute-value charts through listChartData

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; D-D-1/D-D-2/D-D-3/D-D-5, D-D-4)
- **Guard:** `src/api/dataInsights.test.ts` (filter builder, headline/change formulas, strict fetch), `src/views/insights/DataAssetsView.test.ts` (service cards, permission gate, 7-day default)
- **Related:** `~/workspace/work/milestone-20261107/RULING-data-insights.md`, `wave1/REVIEW-W1-1-G13.md`, `~/workspace/work/milestone-20261107/DECISIONS-RESOLVED.md` (D group)

## Context

The `/insights/data-assets` page showed its two "% services with
description/owner" cards as hard-coded empty states, and its summary
description/owner % read the latest point of the percentage series —
a single entity type's value, not the global %. The official page takes
the headline % from the global summary cards and the change value from
the absolute-value KPI charts, and gates the page on `ViewAll` +
`DATA_INSIGHT_CHART`. The server side was already complete at this
baseline (chart definitions, both chart endpoints, ES aggregation,
DataInsights App refresh chain), so this is a frontend-only change.

## Decision

1. **Chart names.** `SYSTEM_CHART_NAMES` gains
   `percentage_of_service_with_description` and
   `percentage_of_service_with_owner`. The pipeline section keeps
   rendering only the four original charts (`PIPELINE_CHART_NAMES`):
   the service charts have their own cards and must not also appear as
   pipeline lines. The service cards fetch one strict batch holding the
   2 service charts, the 4 summary cards and the 2 absolute-value KPI
   charts.
2. **Headline % and change (scheme A, D-D-1).** The headline is the
   summary card's latest-day value, taking the row with the greatest
   `day` — never the first row, because the server returns rows in no
   guaranteed order. The change is the official formula
   `(last-day absolute / last-day total − first-day absolute / first-day
   total) × 100` in percentage points, with the first and last days
   taken from the `total_data_assets` series and the absolute values
   read on those same days. Both formulas are pure functions in
   `api/dataInsights.ts` with hand-computed unit tests.
3. **Summary correction (D-D-1).** The summary description/owner cards
   now read the global summary cards too. A card is omitted when its
   summary card has no value, rather than falling back to the old
   single-entity-type approximation. This is a corrective change in the
   displayed values and belongs in the release notes.
4. **Default window (D-D-2).** The page default is `last7`, matching the
   official 7-day default; the `insightsDatePresetFromKey` fallback is
   `last7` as well.
5. **Team/tier filter (D-D-3).** Team and tier multi-selects send the
   official filter with every system-chart request, built field for
   field from official `DataInsightPureUtils.ts:226-269` (tier values as
   `term` on `tier.keyword`, team values as `term` on
   `owners.name.keyword` inside a `nested` query on `owners`). Team
   options are team names from the team list; tier options are Tier
   classification tag FQNs. The web-activity `/aggregate` calls are not
   filtered: they take single `tier`/`team` parameters, not this filter
   object.
6. **Permission gate.** The page requires `ViewAll` on resource
   `dataInsightChart`, verified against the server tree at this
   baseline: `Entity.DATA_INSIGHT_CHART = "dataInsightChart"`
   (`Entity.java:253`), `DataInsightChartResource` passes it to the
   `EntityResource` constructor (`DataInsightChartResource.java:75`),
   whose constructor registers it via
   `Entity.registerResourcePermissions` → `ResourceRegistry.addResource`
   (`EntityResource.java:181`, `Entity.java:493-497`), so
   `GET /v1/permissions/dataInsightChart` resolves. The isAdminUser
   line is also honoured (P1 dual-line lock). Without permission the
   page shows a placeholder and issues no chart requests; a failed
   permission check fails closed. Live verification of the gate with a
   non-admin account is still owed (0-5 follow-up).
7. **Failure semantics.** The legacy `listSystemChartData` 4xx → `{}`
   silence is kept for the pipeline charts only. The service-card batch
   is fetched with `strict: true`, so a 4xx/5xx surfaces: a warning
   Alert on the page, an error state in both cards, and a
   `console.warn` entry. A genuinely empty result still shows the
   `SmState` empty state, and the empty test-ids never appear when data
   is present.
8. **KPI target.** The target shown on a service card is the
   `targetValue` of the KPI whose `dataInsightChart` is the matching
   `*_kpi` chart name (the `CreateKpiRequest.dataInsightChart` enum).
   The bare percentage-chart name is also accepted for the same
   coverage. No KPI means no target is shown; no "Add KPI" entry point
   is added (D-D-5, residual R-5).
9. **Not changed (D-D-4).** The server's security behaviour — non-admin
   + search access control on + a `filter` present returns empty
   snapshots — is not relaxed or worked around.

## Consequences

- The two service cards show real per-service lines, a global headline
  %, a percentage-point change, KPI targets when defined, and a
  searchable, descending per-service latest-% list with legend-click
  filtering (service names unpluralised, as official).
- Summary description/owner values change from single-entity-type
  values to global values; the pipeline charts and web-activity section
  are unaffected except for the narrower default window and the filter.
- If live pre-verification (0-5) finds a chart name missing from the
  deployed `di_chart_entity` table or the DataInsights App not running,
  the service cards will show their failure state instead of data, and
  the batch must not merge until that is fixed server-side.
