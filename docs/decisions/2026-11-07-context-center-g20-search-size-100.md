# G-20 document search takes 100 hits in one fetch, guarded by generation

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Wave 1 W1-3
- **Guard:** `contextCenter.test.ts` (`searchContextFiles` sends `size=100`, the folder term filter only when a folder is selected, and maps `_source` rows); `ContextCenterDocumentsView.test.ts` (stale search responses are discarded)
- **Related:** W1-3 review condition 2; `RULING-context-center.md` §3.1; upstream pin `a3012259ca` (`ContextCenterDocumentsPage.tsx` `runSearchFetch`, `rest/searchAPI.ts` `rawSearchQuery`)

## Context

Official's document search is a single fetch with no search-state
pagination (`searchQuery` defaults `pageSize = 10`), and the search
result replaces the list view. The product's REST list page is 100 rows
(`limit: 100` + load-more, per condition 4's infinite-scroll decision),
so a search returning only 10 rows would show a visibly smaller working
set than browsing the same folder. Official also guards overlapping
searches with a generation counter (`isCurrentGeneration`): only the
latest request's response may update the list, so a slow earlier
response cannot overwrite a newer one mid-debounce.

## Decision

- `searchContextFiles` (in `api/contextCenter.ts`, not `searchAssets` —
  see below) sends `size=100`: the search view is the list's replacement
  with no search-state paging, and 100 matches the REST page size, so
  searching a folder shows the same working set as browsing it.
- The search does **not** reuse `searchAssets`: its `SearchHit` mapping
  drops the columns the document table renders (`fileExtension`,
  `fileSize`, `folder`, `memoryCount`, `processingStatus`, `sourceUrl`,
  `updatedBy`). `searchContextFiles` calls `GET /v1/search/query`
  directly (`index='contextFile'`, `sort_field='updatedAt'`,
  `sort_order='desc'`), maps each hit's `_source` through the existing
  `mapContextFile`, and takes the total from `hits.total.value`. No
  per-row `getContextFileById` refetch (no N+1).
- The view keeps a generation counter per search run and applies a
  response only when its generation is still the latest; stale responses
  are discarded.
- The folder term filter is the official shape, attached only when a
  folder is selected (see ADR
  `2026-11-07-context-center-search-query-filter-is-a-json-string`).
