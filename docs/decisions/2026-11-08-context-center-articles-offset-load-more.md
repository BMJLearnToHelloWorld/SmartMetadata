# Context Center articles list pages by offset with load-more

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 W2-1 (G-19)
- **Guard:** `ContextCenterArticlesView.test.ts` ("loads the REST default path with the official field list and load-more appends page 2")
- **Related:** W2-1 review conditions 1, 2; upstream pin `a3012259ca` (`KnowledgePageListComponent.tsx`); companion record `2026-11-08-context-center-articles-search-mapping.md`

## Context

The articles list was cursor-paged (`after`/`before`). Official appends
pages by offset (`PAGE_SIZE_MEDIUM = 25`) with infinite scroll:
`fetchUnfilteredKnowledgePages` sends `offset` to the REST list and
`fetchFilteredKnowledgePages` sends `from=(pageNumber-1)*pageSize` to the
search endpoint, appending with `uniqBy(id)`. Cursor paging on the REST
list also collides with `sortBy` (server 400, see the search-mapping
record).

## Decision

- The list sends `limit=25` and `offset=pages.length` on load-more, and
  never sends `after`/`before`. The footer is the `EntityListShell`
  load-more button (`hasMore = pages.length < total`), not the prev/next
  pager — the memories list (G-21) uses prev/next, the articles list
  uses append, each per its official component.
- Appended pages are deduplicated by id (`appendUniquePages`, official
  `uniqBy(id)`), so a re-fetch after a create/delete cannot duplicate
  rows.
- A new search, filter, sort, or tab resets to offset 0; only the latest
  request commits (generation guard, as in the official component).
- The REST path always sends the full official field list
  (`owners,votes,followers,tags,domains,relatedEntities,dataProducts,reviewers`)
  so follow state, votes, and publication date are available on every
  row without a second fetch.
