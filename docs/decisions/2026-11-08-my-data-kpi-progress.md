# KPI widget (my-data stage B)

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `KpiWidget.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 17, official `hooks/useKpiProgress.ts`, `components/MyData/Widgets/KpiProgressWidget/`

## Context

The stage-B KPI card is the official `KpiProgressWidget`
(`hooks/useKpiProgress.ts`, `KpiProgressRow.tsx`, `Sparkline.tsx`): the
KPI list, one `kpiResult` series per KPI over the selected window,
linear projection to the end date, and a status derived from that
projection. The stage-A card showed current values only.

## Decision

- Windows [30, 90, all], default 30. The list ignores the window — only
  each KPI's series follows it — so an empty card means no KPI
  definitions, not window-no-data.
- `fetchAllKpis` pages `listKpis` with `fields=dataInsightChart`, page
  size 50, until the server total is covered.
- Per-KPI `kpiResult` with `startTs`/`endTs`, `orderBy: 'ASC'`, fetched
  concurrently with `Promise.all` (no bulk endpoint exists).
- Linear projection uses the first-to-last result spacing, not the
  window length: a KPI that started reporting a week into a 30-day
  window moved its whole delta in that week.
- Status rules: `daysLeft <= 0` → `current >= target` onTrack else
  missed; projected null → onTrack; else `projected >= target` onTrack
  else atRisk. `atRiskCount` counts every non-onTrack KPI.
- Empty state = no KPI definitions; create gate is `kpi` `canCreate`,
  opening `/insights/kpis/add`; manage opens `/insights/kpis`.
- Product adaptation: the sparkline is an inline SVG polyline with a
  filled area and a dashed target line. Official uses an ECharts area
  chart; the product has no chart component for this shape, and the SVG
  keeps the same footprint (trend + area + target line) without a new
  dependency.

## Consequences

- The card agrees with the KPI list on which KPIs exist, and a range
  switch never serves the previous window's series.
- A finished KPI that beat its target is never reported missed on a
  single-point series.

## Guard

`src/features/home/widgets/KpiWidget.test.ts` covers the projection
arithmetic, the status rules, the window switch, and the empty-state
distinction.
