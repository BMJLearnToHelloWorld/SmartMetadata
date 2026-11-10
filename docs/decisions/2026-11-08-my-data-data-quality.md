# Data Quality widget (my-data stage B)

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `dataQualityFilters.test.ts`, `DataQualityWidget.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 15, official `components/MyData/Widgets/DataQualityWidget/`, `hooks/useDataQualitySummary.ts`

## Context

The stage-B Data Quality card is the official `DataQualityWidget`
(`hooks/useDataQualitySummary.ts`, `utils/dataQualityFilters.ts`,
`DataQualityTestRows.tsx`): scope/range/groupBy controls, three
limit-1 status counts plus the latest 8 rows, per-table counts from one
`getDataQualityReport` call, and an empty state that opens the Data
Quality page.

## Decision

- Default filters: scope `all`, range 30 days (the Data Quality page's
  own default), testCaseType `all`. `groupBy` only re-sorts the rows —
  it never changes the query.
- Counts: three limit-1 searches (Failed / Success / Aborted) so
  `paging.total` is the whole bucket; a fourth unfiltered limit-1 count
  tells "no tests at all" (`hasNoTests`) from "quiet in this window".
  Rows: the latest 8 results of any status, failures first, with
  `fields=testCaseResult,incidentStatus`.
- Table counts come from a single `getDataQualityReport`
  (`TABLE_STATUS_AGGREGATION`, index `testCase`, `q=toTableCountsQuery`)
  and are isolated from the card's loading/error state: a failure there
  leaves the table headers counting the rows shown.
- `testCaseStatus` is joined to a comma string before the call
  (`listTestCasesBySearch` takes a string; `apiRequest` takes no arrays).
- The empty state's create-test entry has no permission gate — official
  has none either: whether a test may be added depends on the table
  picked on the Data Quality page.
- Product adaptations: the "Raise incident" row action opens the
  test-case detail page (`quality-test-case`) — the product's detail
  view keeps its active tab in local state, so there is no URL to land
  on the Issues tab directly; the Issues tab is one click away. The
  incident line reuses the product's `incidentStatusLabel`.

## Consequences

- The card's counts stay true at any page size, and the footer opens a
  page that agrees with the card's 30-day window.
- A failed table-counts lookup degrades to per-row counts, never to a
  failed card.

## Guard

`src/features/home/widgets/DataQualityWidget.test.ts` and
`src/catalog/dataQualityFilters.test.ts` cover the filter defaults, the
status ranking, the table-count aggregation, the `hasNoTests`
distinction, and the isolated table-counts failure.
