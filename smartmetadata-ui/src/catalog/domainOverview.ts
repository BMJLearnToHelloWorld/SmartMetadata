/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { searchAssets } from '@/api/search';
import type { SearchHit } from '@/types/api';

/**
 * Domains / Data Products overview helpers, ported from the official
 * framework (`hooks/useDomainOverview.ts`).
 *
 * ADR:2026-11-08-my-data-domains-data-products
 */

export const OVERVIEW_PAGE_SIZE = 50;

/**
 * The ownership buckets the Domains and Data Products cards filter by. Each
 * one is answered by the server, not by filtering the rows already on screen —
 * those are one page of the estate, and a bucket counted or filtered over a
 * page describes the page.
 */
export type OverviewFilter = 'all' | 'noOwner' | 'empty';

/** The order the server pages in. Asset counts are not on the search document. */
export type OverviewOrder = 'name' | 'recentlyUpdated';

const ORDER_SORT: Record<OverviewOrder, { sortField: string; sortOrder: 'asc' | 'desc' }> = {
  name: { sortField: 'name.keyword', sortOrder: 'asc' },
  recentlyUpdated: { sortField: 'updatedAt', sortOrder: 'desc' },
};

/** `owners` is a nested field on both indexes, so "has none" needs the nested form. */
export const UNOWNED_QUERY_FILTER = {
  query: {
    bool: {
      must_not: [
        {
          nested: { path: 'owners', query: { exists: { field: 'owners.id' } } },
        },
      ],
    },
  },
};

/**
 * Top-level domains only. The Domains page lists sub-domains under their
 * parent, not beside it, and a root's asset count already includes its
 * sub-domains' — so counting both would disagree with that page twice over.
 * ADR:2026-10-16-landing-overview-cards-match-the-pages-they-open
 */
export const ROOT_DOMAIN_CLAUSE = {
  bool: { must_not: [{ exists: { field: 'parent' } }] },
};

type QueryFilter = { query: Record<string, unknown> };

/** ANDs a scope clause (e.g. {@link ROOT_DOMAIN_CLAUSE}) into a bucket filter. */
function withScope(
  queryFilter: QueryFilter | undefined,
  scope: Record<string, unknown> | undefined,
): QueryFilter | undefined {
  return scope
    ? {
        query: {
          bool: {
            must: [scope, ...(queryFilter ? [queryFilter.query] : [])],
          },
        },
      }
    : queryFilter;
}

/**
 * The FQNs a bucket is restricted to, by name. Asset counts are not on either
 * search document, so "empty" is resolved from the count map first and the
 * page fetched by FQN — capped at one page, which is all the card lists, and
 * which keeps the request URL bounded however many entities are empty.
 */
export function fqnQueryFilter(fqns: string[]): QueryFilter {
  return {
    query: {
      bool: { must: [{ terms: { fullyQualifiedName: fqns } }] },
    },
  };
}

/** FQNs whose count is zero — every entity is in the map, empty ones included. */
export function emptyFqnsOf(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([, count]) => count === 0)
    .map(([fqn]) => fqn)
    .sort((a, b) => a.localeCompare(b));
}

/** One page for a bucket; "empty" with nothing empty needs no request at all. */
export async function fetchOverviewPage(
  searchIndex: 'domain' | 'dataProduct',
  filter: OverviewFilter,
  emptyFqns: string[],
  order: OverviewOrder = 'name',
  scope?: Record<string, unknown>,
): Promise<{ sources: SearchHit[] }> {
  if (filter === 'empty' && emptyFqns.length === 0) {
    return { sources: [] };
  }
  const queryFilter = {
    all: undefined,
    noOwner: UNOWNED_QUERY_FILTER,
    empty: fqnQueryFilter(emptyFqns.slice(0, OVERVIEW_PAGE_SIZE)),
  }[filter];

  const page = await searchAssets('', 0, OVERVIEW_PAGE_SIZE, {
    index: searchIndex,
    query_filter: JSON.stringify(withScope(queryFilter, scope) ?? {}),
    // Never relevance: an empty query ranks by boosts like tier and votes, so a
    // new entity could never reach the page however the card then sorts it.
    sortField: ORDER_SORT[order].sortField,
    sortOrder: ORDER_SORT[order].sortOrder,
  });
  return { sources: page.hits };
}

/** How many entities have no owner, across the estate — a count, so no rows. */
export async function fetchUnownedCount(
  searchIndex: 'domain' | 'dataProduct',
  scope?: Record<string, unknown>,
): Promise<number> {
  const page = await searchAssets('', 0, 0, {
    index: searchIndex,
    query_filter: JSON.stringify(withScope(UNOWNED_QUERY_FILTER, scope) ?? {}),
  });
  return page.total;
}
