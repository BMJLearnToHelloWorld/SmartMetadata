# Services list `?health=` filter (PlatformHealth view-all target)

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `views/ingestion/ServicesListView.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 8, official `components/MyData/Widgets/PlatformHealthWidget/PlatformHealthWidget.tsx` (`goToHealth`), `components/MyData/ConnectionsPage/ConnectionsPage.constants.ts` (`HEALTH_PARAM`)

## Context

Official's PlatformHealth view-all appends `?health=<filter>` only
in embedded mode; classic Settings > Services ignores it. The review
(C-7/C-8) decided the product implements the filter in
ServicesListView and links with `?health=` — a deliberate product
adaptation, not a direct port.

## Decision

- `ServicesListView` reads `route.query.health` (`failing` /
  `healthy` / `notRun`; any other value means no filter) and shows a
  health chip row above the kind tabs with estate-wide counts from
  one `getServicesOverview(OVERVIEW_PARAMS)` call, summed over
  `healthCounts`.
- When a filter is set, rows load from
  `getServicesOverview({ ...OVERVIEW_PARAMS, health: [mapped], limit: 100 })`
  mapped to `CatalogService` (kind via `KIND_BY_ENTITY_TYPE`,
  fallback `'database'`); when unset, the existing per-kind load
  runs. Changing the filter reloads via `watch(healthFilter)`.
- Health mapping is the PlatformHealth mapping: failing → `failed`,
  healthy → `success`, notRun → `notRun` (lowercase wire values, per
  the `ServiceHealth` enum).
- `CONNECTIONS_ENTITY_TYPES`, `KIND_BY_ENTITY_TYPE` and
  `OVERVIEW_PARAMS` are exported from `usePlatformHealth.ts` so the
  view and the widget share one definition of the filter.

## Consequences

- The PlatformHealth "view all" link lands on a filtered services
  list instead of the unfiltered one.
- The chip counts and the filtered rows come from the same overview
  call, so they cannot disagree about the estate.
