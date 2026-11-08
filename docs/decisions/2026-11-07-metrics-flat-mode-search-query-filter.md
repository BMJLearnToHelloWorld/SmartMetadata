# Metrics flat mode: searchAssets + query_filter (not the list endpoint)

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Wave 1 W1-4
- **Guard:** `api/metrics.test.ts` (7 status values emit the official term; `In Review` keeps its space), `views/governance/MetricsListView.test.ts` (status switch loads flat mode with the term filter)
- **Related:** W1-4 review condition 1; RULING-metrics.md §4 step 1; W1-3 base (`query_filter?: string`, ADR:2026-11-07-context-center-search-query-filter-is-a-json-string); upstream pin `a3012259ca` (`MetricListPage.tsx:337-353`, `rest/metricsAPI.ts`, `utils/SearchPureUtils.ts getTermQuery`)

## Context

Once a status filter is set, the metrics list switches to flat search mode
(`isTreeMode = !statusFilter`, official `MetricListPage.tsx:324`). The flat
mode must express search text and a status filter in one request. Two
server-side routes could serve it:

- (a) `searchAssets` + `query_filter` — the official flat branch calls
  `searchQuery` with `queryFilter: getTermQuery({ entityStatus:
  statusFilter })`.
- (b) `GET /v1/metrics?entityStatus=` — the server list endpoint does
  accept `entityStatus` (`MetricResource.java:391-396`), but it has no
  `q` parameter, so text + status in one call is impossible; (b) would
  need two requests with client-side reconciliation and wrong totals.

## Decision

- Flat mode uses (a): `searchAssets(composeSearchQuery(text,
  { entityType: ['metric'] }), from, size, { query_filter:
  buildMetricStatusQueryFilter(status) })`.
- The term filter is the official `getTermQuery` shape verbatim —
  `{ query: { bool: { must: [{ term: { entityStatus: status } }] } } }`
  — serialized with `JSON.stringify` by the caller, because the
  server's `query_filter` is a String and `apiRequest` would stringify
  a bare object to `"[object Object]"`. The `query_filter?: string`
  signature and the stringify convention are reused from the W1-3
  base; this batch does not re-implement them.
- Status values are the official `EntityStatus` values verbatim
  (`METRIC_STATUS_VALUES` in `api/metrics.ts`): `Approved`, `Archived`,
  `Deprecated`, `Draft`, `In Review`, `Rejected`, `Unprocessed`. The
  `InReview` member's value is `"In Review"` with a space — never
  hand-write `"InReview"` as a term value, or the filter matches
  nothing in the index.
- `searchAssets` existing callers are untouched. The flat rows read
  their status column from the search hit itself, so `SearchHit`
  carries `entityStatus` (plus `parent`, `metricType`, `granularity`,
  `childrenCount`) mapped from `_source` in `catalog/searchHits.ts`.

## Consequences

- Text + status combine in one request with a server-side total, as
  official does; the tree search keeps its own path (hierarchy `q` +
  `getMetricSearchPaths`).
- The batch depends on the W1-3 base being in the merge base: this
  branch is based on the W1-3 base commit, and rebases onto main once
  W1-3 lands (the base commit then drops out as already applied).
