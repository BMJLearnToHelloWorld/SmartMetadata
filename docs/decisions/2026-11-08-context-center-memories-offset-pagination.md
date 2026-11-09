# Context Center memories list pages by offset, not cursor

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 W2-1 (G-21)
- **Guard:** `ContextCenterMemoriesView.test.ts` ("pages by offset: page 2 requests offset=25 and never a cursor (R-W13-1)"); `contextCenterMemories.test.ts` (sort config)
- **Related:** W2-1 review condition 1; residual R-W13-1; upstream pin `a3012259ca` (`ContextCenterMemoriesPage.tsx` `fetchMemories`, `ContextCenter.constants.ts`); server `ContextMemoryResource.java:218,379-387`

## Context

The memories list was cursor-paged (`after`/`before`). The server list
endpoint turns search-backed when any of `q`, `statuses`, `assets`,
`author`, `pinned`, or `sortBy` is present, and `validateSearchBackedListParams`
rejects cursor params on a search-backed list with 400 — so page 2 of a
filtered list always failed (residual R-W13-1). Official pages the same
list by offset: `offset = (page - 1) * size` with `PAGE_SIZE_MEDIUM = 25`.

## Decision

- The memories list sends `limit=25` and `offset=(currentPage-1)*25`, and
  never sends `after`/`before`. The footer is the `EntityListShell`
  prev/next pager (`hasNext = offset + data.length < total`).
- Tab counts are three parallel `limit: 0` reads (all / created-by-me /
  open reviews), all filtered by the selected statuses, mirroring
  official `fetchMemoryCounts`. The pinned count is a stub 0: official
  has no pinned card in this view (C-D8), so no pinned card is built.
- Sort follows official `getSortConfig`: `updated` → `updatedAt` desc,
  `usage` → `appliedCount` desc (never `usageCount`), `updatedBy` →
  `updatedBy` desc.
- The status multi-select always keeps at least one status selected
  (official `handleStatusChange`), re-sorted into the canonical
  `MEMORY_STATUSES` order on every change.
- The conflict-review list is the deliberate exception: it stays
  cursor-paged (`after`, 20 per page), because official
  `useMemoryConflictReviews` pages tasks by cursor, not offset.
