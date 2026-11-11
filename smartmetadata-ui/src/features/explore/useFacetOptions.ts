/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref, type Ref } from 'vue';
import { searchAssets } from '@/api/search';
import { type FacetBucket, type FacetId, type SearchFacet } from '@/catalog/searchFacets';
import { composeFacetQuery, selfExcludedFacetIds, type SearchFilters } from '@/catalog/searchQuery';

export interface FacetOptionsContext {
  query: string;
  filters: SearchFilters;
  index: string;
  deleted: boolean;
  queryFilter?: string;
}

/** Official ExploreQuickFilters INITIAL_OPTIONS_CACHE_MAX. */
export const FACET_OPTIONS_CACHE_MAX = 50;
/** Official ExploreQuickFilters SEEN_OPTIONS_CACHE_MAX. */
export const FACET_SEEN_OPTIONS_CACHE_MAX = 500;

/**
 * Per-facet chip options, ported from official's ExploreQuickFilters
 * (components/Explore/ExploreQuickFilters.tsx): when a chip's dropdown
 * opens, its options are fetched with the self-excluded query
 * (`composeFacetQuery`) so selecting a value never shrinks its own
 * facet's list. The options cache is keyed by the full context
 * (facet, index, deleted flag, search text, self-excluded query,
 * query filter) and capped at 50 entries, empty results are never
 * cached, and in-flight fetches are deduplicated per key; only the
 * newest fetch for a facet may write. Selected values that the fetch
 * does not return keep their last-known label and count from the
 * seen-options map (capped at 500, recency-ordered), mirroring
 * official's `publishOptions`/`seenOptionsRef`.
 *
 * The main search's facets stay the chips' options until a dropdown
 * opens — the exact equivalent of official's `canUsePageAggregations`
 * path. A new search invalidates the per-facet overrides (`reset`);
 * the context-keyed cache survives, so reopening under the same
 * context is instant.
 * ADR:2026-11-11-explore-facet-self-exclusion.
 */
export function useFacetOptions(getContext: () => FacetOptionsContext): {
  chipFacets: Ref<Partial<Record<FacetId, SearchFacet>>>;
  loadOptions: (facetId: FacetId) => Promise<void>;
  rememberFacets: (facets: SearchFacet[]) => void;
  reset: () => void;
} {
  const chipFacets = ref<Partial<Record<FacetId, SearchFacet>>>({});
  const cache = new Map<string, SearchFacet>();
  const seen = new Map<string, FacetBucket>();
  const inFlight = new Map<string, Promise<SearchFacet | undefined>>();
  const latestRequest = new Map<FacetId, number>();
  let requestSeq = 0;
  let generation = 0;

  function cacheKey(facetId: FacetId, context: FacetOptionsContext, query: string): string {
    return [
      facetId,
      context.index,
      context.deleted ? 'deleted' : 'live',
      context.query,
      query,
      context.queryFilter ?? '',
    ].join('::');
  }

  function noteSeen(facetId: FacetId, bucket: FacetBucket): void {
    const key = `${facetId}::${bucket.key}`;
    seen.delete(key);
    seen.set(key, bucket);
    if (seen.size > FACET_SEEN_OPTIONS_CACHE_MAX) {
      const oldest = seen.keys().next();
      if (!oldest.done) {
        seen.delete(oldest.value);
      }
    }
  }

  function rememberFacets(facets: SearchFacet[]): void {
    for (const facet of facets) {
      for (const bucket of facet.buckets) {
        noteSeen(facet.id, bucket);
      }
    }
  }

  function withSelectedValues(facetId: FacetId, facet: SearchFacet, filters: SearchFilters): SearchFacet {
    const selected = filters[facetId] ?? [];
    if (selected.length === 0) {
      return facet;
    }
    const present = new Set(facet.buckets.map((bucket) => bucket.key));
    const restored = selected.flatMap((value) => {
      if (present.has(value)) {
        return [];
      }
      const known = seen.get(`${facetId}::${value}`);
      return known ? [known] : [];
    });
    if (restored.length === 0) {
      return facet;
    }
    return { ...facet, buckets: [...facet.buckets, ...restored] };
  }

  function applyFetched(
    facetId: FacetId,
    facet: SearchFacet,
    key: string,
    filters: SearchFilters,
  ): void {
    const merged = withSelectedValues(facetId, facet, filters);
    rememberFacets([merged]);
    if (facet.buckets.length > 0) {
      if (cache.size >= FACET_OPTIONS_CACHE_MAX) {
        cache.clear();
      }
      cache.set(key, merged);
    }
    chipFacets.value = { ...chipFacets.value, [facetId]: merged };
  }

  async function loadOptions(facetId: FacetId): Promise<void> {
    const context = getContext();
    const query = composeFacetQuery(context.query, context.filters, facetId);
    const key = cacheKey(facetId, context, query);
    const cached = cache.get(key);
    if (cached) {
      chipFacets.value = {
        ...chipFacets.value,
        [facetId]: withSelectedValues(facetId, cached, context.filters),
      };
      return;
    }
    const narrowed = selfExcludedFacetIds(facetId).some(
      (id) => (context.filters[id]?.length ?? 0) > 0,
    );
    if (!narrowed) {
      // No filter on this facet: the main-search facets already carry
      // the correct options. Drop any stale per-facet entry from an
      // older context so the chips fall back to them.
      if (chipFacets.value[facetId]) {
        const next = { ...chipFacets.value };
        delete next[facetId];
        chipFacets.value = next;
      }
      return;
    }
    const pending = inFlight.get(key);
    if (pending) {
      // The originator applies the result; this caller only waits for
      // the dropdown to settle.
      await pending;
      return;
    }
    const requestId = ++requestSeq;
    latestRequest.set(facetId, requestId);
    const startedGeneration = generation;
    const fetchTask = (async (): Promise<SearchFacet | undefined> => {
      try {
        const page = await searchAssets(query, 0, 0, {
          index: context.index,
          deleted: context.deleted,
          query_filter: context.queryFilter,
        });
        return page.facets.find((item) => item.id === facetId);
      } catch {
        // A failed options fetch leaves the main-search facets in
        // place rather than turning the failure into a wrong list.
        return undefined;
      }
    })();
    inFlight.set(key, fetchTask);
    const facet = await fetchTask;
    inFlight.delete(key);
    if (startedGeneration !== generation || latestRequest.get(facetId) !== requestId) {
      return;
    }
    if (!facet) {
      return;
    }
    applyFetched(facetId, facet, key, context.filters);
  }

  function reset(): void {
    generation += 1;
    chipFacets.value = {};
  }

  return { chipFacets, loadOptions, rememberFacets, reset };
}
