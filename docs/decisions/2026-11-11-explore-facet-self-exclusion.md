# Explore chip options exclude the chip's own filter

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai
- **Guard:** `src/views/SearchView.test.ts` — "keeps Metric in the entityType chip after Tag is selected" and "keeps other services in the service chip after one service is selected"; `src/features/explore/useFacetOptions.test.ts`
- **Related:** `~/workspace/work/official-analysis-20261111/track3-explore-filters.md` (C2), `~/workspace/work/explore-facet-self-exclusion/RULING.md`

## Context

Selecting an Explore filter shrank its own facet's options to just the
selection: with `entityType=tag` active, the entityType chip offered only
`tag (17)` and Metric vanished, although the estate holds 2 metrics. The
chip options came from the main search's aggregations, which are computed
on the full filter — so every chip's list was narrowed by its own
selection. Official has the same shape (quick-filter chips fed by the
page aggregations) but does not have the bug: its `ExploreQuickFilters`
fetches each facet's options with every filter except the facet's own
(`getFacetQueryFilter`), keeping two entity-type filter keys
(`entityType`, `entityType.keyword`) and excluding both when the
entity-type dropdown opens.

## Decision

Port official's per-facet self-exclusion to this console's Lucene `q`
transport, with no hardcoded facet list:

- `composeFacetQuery(userQuery, filters, facetId)` (`catalog/searchQuery.ts`)
  builds the query behind one facet's options from every active filter
  except the facet's own, keeping the free text. The excluded ids are
  derived from the facet's own mapping: a filter is excluded when its
  Lucene field is one of the facet's aggregation names
  (`aggregationFieldNamesForFacet`, `catalog/searchFacets.ts`). The
  entity-type facet records two aggregation names (`entityType`,
  `entityType.keyword`), but this console collapses official's two
  entity-type filter keys into the one `entityType` FacetId, so the
  exclusion is the singleton — the `.keyword` name is recorded, not
  excluded, because there is no second filter id to exclude.
- `useFacetOptions` (`features/explore/useFacetOptions.ts`) fetches a
  chip's options lazily when its dropdown opens, with a size-0
  `searchAssets` call carrying that self-excluded query, the active
  tab's index, the deleted flag, and `query_filter` passed through
  verbatim. The options cache is keyed by the full context and capped
  at 50 entries; empty results are never cached; in-flight fetches are
  deduplicated per key and only the newest fetch for a facet may write.
  Selected values the fetch omits keep their last-known label and count
  from a seen-options map (capped at 500, recency-ordered), fed from the
  main-search facets.
- The main-search facets stay the chips' options until a dropdown opens
  (official's `canUsePageAggregations` path). A new search resets the
  per-facet overrides; the context-keyed cache survives. A failed
  options fetch leaves the main-search facets in place rather than
  turning the failure into a wrong list.
- The main result list, tab counts, tree drill, and estate-presence
  search are unchanged; only the chip options source changes.

## Consequences

- Selecting a value no longer hides its facet's other options, matching
  official's behaviour at the source level. The estate-presence search
  is not (mis)used as a chip-options source: the per-facet fetch is the
  only correct source, because estate presence ignores the other active
  filters.
- Each chip dropdown costs one size-0 search request on first open per
  context; later opens hit the cache. The caps (50 options entries, 500
  seen entries) bound the memory this adds.
- A future facet whose filter field is an aggregation-name variant of
  another facet is excluded by the same derivation, with no code change.
  Adding a facet still means adding its `AGG_TO_FACET` entry and its
  `FILTER_LUCENE_FIELD` entry, as before.
