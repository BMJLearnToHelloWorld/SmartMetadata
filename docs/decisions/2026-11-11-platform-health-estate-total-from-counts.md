# Platform Health estate total comes from the overview count maps

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai
- **Guard:** `usePlatformHealth.test.ts` + `PlatformHealthWidget.test.ts` (estate-total regression)
- **Related:** `2026-11-08-my-data-platform-health-service-link.md`

## Context

On 2026-11-11 the homepage Platform Health card showed "尚未连接服务"
(zero connected services) although a database service existed, after a
refresh and a re-login. The server data was correct: the unfiltered
overview returned total 1 with the service in the `notRun` bucket, and
`health=notRun` returned the row.

The widget's first call is the overview with `health=failed`. That call
returns `paging.total: 0` (no failed services) while its `healthCounts`
correctly shows `databaseService: {notRun: 1}`. `fetchPipelineStats`
(`smartmetadata-ui/src/features/home/widgets/usePlatformHealth.ts`) set
`connectedServices: overview.total` from that filtered call, and the card
renders the empty state when `connectedServices === 0`. So whenever zero
services are failing, the card shows zero — no matter how many healthy or
not-run services exist. Conversely, when a service IS failing,
`connectedServices` equalled the failed count, undercounting the estate.

The server's contract is documented, not a server bug:
`openmetadata-service/.../resources/services/ServicesOverviewResource.java`
states "The three selectors (`listEntityType`, `serviceType`, `health`)
narrow only `data` and `paging.total`, so a client can use each count map
as the option list for its own filter control". Only the count maps
(`counts`, `healthCounts`, `serviceTypeCounts`) are estate-wide;
`paging.total` follows the filter. The widget's comment ("Its `health`
filter narrows only the page, never the counts") was wrong about `total`:
it narrows the page AND the total.

`ServicesListView.vue` does not have this bug: with a health filter it uses
`overview.total` as the filtered page's total (correct for a list), and its
chips come from a separate unfiltered call summed over `healthCounts`. Only
the homepage widget misused the filtered total as the estate total.

The pin's UI has no equivalent to compare: official at the pin does not call
this overview endpoint for its landing page, and the overview resource itself
is a product-side endpoint. The fix follows the endpoint's own documented
contract.

## Decision

- In `fetchPipelineStats`, `connectedServices` is derived from the
  estate-wide count map instead of the filtered `paging.total`: sum every
  value in `overview.healthCounts` (all entity types, all health states —
  the known four are never enumerated, so an unknown future state cannot
  undercount). This keeps the invariant total == failed + partialSuccess +
  success + notRun, which is exactly what the card displays. (`counts`
  sums to the same number live, but `healthCounts` is the source the bucket
  counts already come from.)
- The misleading comment on `fetchPipelineStats` is corrected to state the
  contract: the selectors narrow `data` and `paging.total`; the count maps
  are estate-wide; the estate total comes from the count maps.

## Consequences

- With zero failed services, the card shows the real estate total and the
  services in their buckets instead of the empty state.
- With failing services, `connectedServices` is the estate total, not the
  failed count, so the "N of M failing" summary and the chips count the
  same estate.
- No server change: the endpoint already behaves per its documented
  contract. No change to `ServicesListView` or to the bucket queries (they
  deliberately use the filtered page).
- The "test connection success does not make a service healthy" semantics
  stay: health comes from ingestion pipeline runs, not from test-connection
  results.
