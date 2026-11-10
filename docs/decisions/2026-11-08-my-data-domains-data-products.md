# Domains / Data Products widgets (my-data stage B)

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `domainOverview.test.ts`, `DomainsDataProductsWidget.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 16, official `hooks/useDomainOverview.ts`, `hooks/useDataProducts.ts`

## Context

The stage-B Domains and Data Products cards are the official
`DomainsOverviewWidget` / `DataProductsOverviewWidget`
(`hooks/useDomainOverview.ts`, `hooks/useDataProducts.ts`): bucket chips
(All / No owner / Empty) answered by the server, asset counts from the
whole-estate `assets/counts` map, rows from a search page.

## Decision

- Counts come from `/domains/assets/counts` and
  `/dataProducts/assets/counts` (one request for the whole estate). The
  map lists every entity, so it also gives the total and the "empty"
  bucket; "no owner" is a size-0 search with the nested-owners
  `must_not` filter.
- Buckets are per-bucket server queries, never filtered out of the rows
  in hand: NO_OWNER via the nested owners filter, EMPTY via an FQN
  terms filter over the zero-count FQNs (capped at one page, 50).
- Domains are root domains only: the Domains page lists sub-domains
  under their parent, and a root's asset count already includes its
  sub-domains'.
- Data Products: `domainCount` from a `domains.fullyQualifiedName`
  aggregation (size 1000); `domainName` is `domains[0]`. Sorting happens
  within the fetched page (mostAssets / recentlyUpdated /
  needsAttention / alphabetical); needsAttention scores ownerless +
  empty. The server pages by name or recency only.
- Create gates: `domain` / `dataProduct` `canCreate` from the
  permission API; the empty-state create entry opens the list page.
  Links go to `/governance/domains` and `/governance/data-products`.

## Consequences

- The cards agree with the Domains / Data Products pages on counts,
  because they read the same map and the same root scope.
- A bucket chip never describes the page in hand: each chip is its own
  server query with its own estate-wide count.

## Guard

`src/features/home/widgets/DomainsOverviewWidget.test.ts`,
`src/features/home/widgets/DataProductsOverviewWidget.test.ts`, and
`src/catalog/domainOverview.test.ts` cover the bucket queries, the
root-domain filter, the empty-FQN resolution, the domain-count
aggregation, and the in-page sorting.
