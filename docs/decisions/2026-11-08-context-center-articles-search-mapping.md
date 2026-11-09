# Context Center articles list: ES search mapping and dual-path rule

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 W2-1 (G-19)
- **Guard:** `contextCenterArticles.test.ts` (sort configs, quick-filter query, page-type term merge, search-path rule); `contextCenter.test.ts` ("knowledge page search (G-19)"); `ContextCenterArticlesView.test.ts` ("switches to the ES path on search …", "forces the ES path for the popularity sort")
- **Related:** W2-1 review conditions 1, 3, 4, 5; upstream pin `a3012259ca` (`KnowledgePageListComponent.tsx`, `ContextCenterArticlesPage.tsx`, `ContextCenter.constants.ts`, `rest/searchAPI.ts`, `ExplorePureUtils.ts`); server `KnowledgePageResource.java:206-212,310-320`, `PageIndex.java`

## Context

Official pages knowledge pages through two paths (`KnowledgePageListComponent`):
ES search when filtered or when the sort has no REST equivalent, else the
REST list. The product list was REST-only with cursor paging, had no
search, no quick filters, no sort, and no `publicationDate`/`totalVotes`
columns. The server REST list 400s when `sortBy` is mixed with cursor
params, and `resolveSortField` only allows
`{name, displayName, createdAt, updatedAt}` — so publication-date and
popularity sorts cannot go through REST at all.

## Decision

- Dual path, per official: `useArticleSearchPath` is true when there is
  a search text, any quick filter, or the sort has no `restSortBy`
  (publicationDate, popularity); otherwise the REST list. Both paths page
  25 at a time by offset (see the companion offset-load-more record).
- The ES path reads GET `/v1/search/query` directly (`index='page'`,
  `from=offset`, `size=25`, `sort_field`/`sort_order` per the sort table,
  `include_aggregations: true`), mapping hits from `_source` through the
  same `mapKnowledgePage` as the REST list — never the `SearchHit` shape,
  which drops `pageType`/`pageUrl`/`publicationDate`. Total comes from
  `hits.total.value`; facets come from the same response's aggregations
  via `mapSearchAggregations` (no separate aggregation request).
- Sort tiers, verbatim from official `ARTICLE_SORT_OPTIONS`: updatedAt
  (`updatedAt`/`updatedAt`/desc), name (`displayName.keyword`/
  `displayName`/asc), publicationDate (`page.publicationDate`, ES-only,
  desc), popularity (`totalVotes`, ES-only, desc). Default is updatedAt.
- Quick filters are the four official fields, per `getQuickFilterQuery`
  (verbatim): `domains.displayName.keyword`, `ownerDisplayName`,
  `tags.tagFQN`, `tier.tagFQN` — term union within a field, intersection
  across fields, empty selection yields no clause. The chips render only
  those four facets (`ExploreFilterChips` `facetIds` prop).
- The product page-type tab (All/Article/QuickLink) is pre-existing
  behavior with no official counterpart; official's list component takes
  no `pageType` prop. The tab is kept and applied on the ES path as a
  `term: {pageType}` clause merged into the same `bool.must` array — the
  ES mapping carries `pageType` as a keyword, so the clause is exact.
  On the REST path the tab stays a `pageType` query param.
- `q` follows official `rawSearchQuery`: the empty string when there is
  no search text (not `'*'`).
- `publicationDate` maps from nested `page.publicationDate` (string, as
  in the index and the entity JSON) and `totalVotes` from the top-level
  field; both are present in the page index (`totalVotes` is 0 when a
  page has no votes).
