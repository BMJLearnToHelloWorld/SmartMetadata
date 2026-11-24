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
import { mapAggregateBuckets, postAggregateFieldOptions, searchAssets } from '@/api/search';
import { isAggregateSourcedFacet, type FacetBucket, type FacetId, type SearchFacet } from '@/catalog/searchFacets';
import {
  composeFacetQuery,
  FILTER_LUCENE_FIELD,
  mergeQueryFilters,
  nullExistsQueryFilter,
  selfExcludedFacetIds,
  type SearchFilters,
} from '@/catalog/searchQuery';

export interface FacetOptionsContext {
  query: string;
  filters: SearchFilters;
  index: string;
  deleted: boolean;
  /**
   * The saved `query_filter` from the URL, unmerged: the hook adds the
   * "No X" (must_not.exists) clauses per facet, excluding the facet's own
   * selection (self-exclusion).
   */
  queryFilter?: string;
}

/** Official ExploreQuickFilters INITIAL_OPTIONS_CACHE_MAX. */
export const FACET_OPTIONS_CACHE_MAX = 50;
/** Official ExploreQuickFilters SEEN_OPTIONS_CACHE_MAX. */
export const FACET_SEEN_OPTIONS_CACHE_MAX = 500;
/** Official ExploreQuickFilters debouncedSearch delay. */
export const FACET_SEARCH_DEBOUNCE_MS = 500;
/** Official ExploreQuickFilters getAggregationOptions default size. */
export const FACET_AGGREGATE_PAGE_SIZE = 10;

/** Pin EntityStatusUtils.isUnprocessedStatus: missing status is Unprocessed. */
export function isUnprocessedEntityStatus(value: string): boolean {
  return !value || value.toLowerCase() === 'unprocessed';
}

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
 *
 * Facets with no page aggregation (catalog/searchFacets.ts
 * isAggregateSourcedFacet) fetch their initial options from POST
 * /v1/search/aggregate instead — official's `getAggregationOptions`
 * path. Typing inside any dropdown searches the same endpoint with the
 * typed text, debounced 500ms (official `debouncedSearch`); an empty
 * search text falls back to the initial options. A pending debounced
 * search is cancelled when its dropdown closes (`cancelSearch`), so a
 * late keystroke can never repaint the next dropdown's options.
 *
 * The glossary Status chip is gated on `checkEntityStatus`: the Status
 * filter only earns its place once some entity has left Unprocessed
 * (official `hasReviewedStatus`); a failed check fails open.
 */
export function useFacetOptions(getContext: () => FacetOptionsContext): {
  chipFacets: Ref<Partial<Record<FacetId, SearchFacet>>>;
  searchingFacets: Ref<readonly FacetId[]>;
  hasReviewedEntityStatus: Ref<boolean>;
  loadOptions: (facetId: FacetId) => Promise<void>;
  searchOptions: (facetId: FacetId, text: string) => void;
  cancelSearch: () => void;
  checkEntityStatus: () => Promise<void>;
  rememberFacets: (facets: SearchFacet[]) => void;
  reset: () => void;
} {
  const chipFacets = ref<Partial<Record<FacetId, SearchFacet>>>({});
  const searchingFacets = ref<FacetId[]>([]);
  const hasReviewedEntityStatus = ref(false);
  const cache = new Map<string, SearchFacet>();
  const seen = new Map<string, FacetBucket>();
  const inFlight = new Map<string, Promise<SearchFacet | undefined>>();
  const latestRequest = new Map<FacetId, number>();
  let requestSeq = 0;
  let generation = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * The structured filter for one facet's options: the saved
   * `query_filter` plus every other facet's "No X" clause. The facet's
   * own null selection is excluded, like its own Lucene clause in
   * composeFacetQuery — selecting "No owner" must not shrink the owner
   * dropdown to nothing.
   */
  function facetQueryFilter(facetId: FacetId, context: FacetOptionsContext): string | undefined {
    return mergeQueryFilters(
      context.queryFilter,
      nullExistsQueryFilter(context.filters, facetId),
    );
  }

  function cacheKey(
    facetId: FacetId,
    context: FacetOptionsContext,
    query: string,
    queryFilter: string | undefined,
  ): string {
    return [
      facetId,
      context.index,
      context.deleted ? 'deleted' : 'live',
      context.query,
      query,
      queryFilter ?? '',
    ].join('::');
  }

  function markSearching(facetId: FacetId, searching: boolean): void {
    const next = searchingFacets.value.filter((id) => id !== facetId);
    if (searching) {
      next.push(facetId);
    }
    searchingFacets.value = next;
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

  function applyOptions(
    facetId: FacetId,
    facet: SearchFacet,
    key: string | undefined,
    filters: SearchFilters,
  ): void {
    const merged = withSelectedValues(facetId, facet, filters);
    rememberFacets([merged]);
    // Searched options are never cached (official caches initial options
    // only); initial options are cached under their context key.
    if (key !== undefined && facet.buckets.length > 0) {
      if (cache.size >= FACET_OPTIONS_CACHE_MAX) {
        cache.clear();
      }
      cache.set(key, merged);
    }
    chipFacets.value = { ...chipFacets.value, [facetId]: merged };
  }

  function applyFetched(
    facetId: FacetId,
    facet: SearchFacet,
    key: string,
    filters: SearchFilters,
  ): void {
    applyOptions(facetId, facet, key, filters);
  }

  async function fetchAggregateOptions(
    facetId: FacetId,
    context: FacetOptionsContext,
    queryFilter: string | undefined,
    fieldValue: string,
  ): Promise<SearchFacet | undefined> {
    const fieldName = FILTER_LUCENE_FIELD[facetId];
    try {
      const response = await postAggregateFieldOptions({
        fieldName,
        fieldValue,
        index: context.index,
        query: queryFilter,
        queryText: context.query ? context.query : undefined,
        deleted: context.deleted,
        size: FACET_AGGREGATE_PAGE_SIZE,
      });
      const buckets = mapAggregateBuckets(response, fieldName).map((bucket) => ({
        key: bucket.key,
        count: bucket.docCount,
      }));
      return { id: facetId, field: fieldName, buckets };
    } catch {
      // A failed options fetch leaves the main-search facets in
      // place rather than turning the failure into a wrong list.
      return undefined;
    }
  }

  async function loadOptions(facetId: FacetId): Promise<void> {
    const context = getContext();
    const query = composeFacetQuery(context.query, context.filters, facetId);
    const queryFilter = facetQueryFilter(facetId, context);
    const key = cacheKey(facetId, context, query, queryFilter);
    const cached = cache.get(key);
    if (cached) {
      chipFacets.value = {
        ...chipFacets.value,
        [facetId]: withSelectedValues(facetId, cached, context.filters),
      };
      return;
    }
    const aggregateSourced = isAggregateSourcedFacet(facetId);
    const narrowed = selfExcludedFacetIds(facetId).some(
      (id) => (context.filters[id]?.length ?? 0) > 0,
    );
    if (!aggregateSourced && !narrowed) {
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
    markSearching(facetId, true);
    const fetchTask = (async (): Promise<SearchFacet | undefined> => {
      if (aggregateSourced) {
        // No page aggregation exists for this field, so the initial
        // options come from the aggregate endpoint with an empty
        // field value (match all), like official's getInitialOptions.
        return fetchAggregateOptions(facetId, context, queryFilter, '');
      }
      try {
        const page = await searchAssets(query, 0, 0, {
          index: context.index,
          deleted: context.deleted,
          query_filter: queryFilter,
        });
        return page.facets.find((item) => item.id === facetId);
      } catch {
        // A failed options fetch leaves the main-search facets in
        // place rather than turning the failure into a wrong list.
        return undefined;
      }
    })();
    inFlight.set(key, fetchTask);
    let facet: SearchFacet | undefined;
    try {
      facet = await fetchTask;
    } finally {
      inFlight.delete(key);
      markSearching(facetId, false);
    }
    if (startedGeneration !== generation || latestRequest.get(facetId) !== requestId) {
      return;
    }
    if (!facet) {
      return;
    }
    applyFetched(facetId, facet, key, context.filters);
  }

  async function runOptionSearch(facetId: FacetId, text: string): Promise<void> {
    const context = getContext();
    if (!text) {
      await loadOptions(facetId);
      return;
    }
    const requestId = ++requestSeq;
    latestRequest.set(facetId, requestId);
    const startedGeneration = generation;
    markSearching(facetId, true);
    let facet: SearchFacet | undefined;
    try {
      facet = await fetchAggregateOptions(
        facetId,
        context,
        facetQueryFilter(facetId, context),
        text,
      );
    } finally {
      markSearching(facetId, false);
    }
    if (startedGeneration !== generation || latestRequest.get(facetId) !== requestId) {
      return;
    }
    if (!facet) {
      return;
    }
    // Searched options replace the dropdown list (no cache write).
    applyOptions(facetId, facet, undefined, context.filters);
  }

  function searchOptions(facetId: FacetId, text: string): void {
    cancelSearch();
    searchTimer = setTimeout(() => {
      searchTimer = undefined;
      void runOptionSearch(facetId, text);
    }, FACET_SEARCH_DEBOUNCE_MS);
  }

  function cancelSearch(): void {
    if (searchTimer !== undefined) {
      clearTimeout(searchTimer);
      searchTimer = undefined;
    }
  }

  async function checkEntityStatus(): Promise<void> {
    const context = getContext();
    try {
      // Official passes the default query filter only — no facet
      // filters, no free text — and fails open on error.
      const response = await postAggregateFieldOptions({
        fieldName: 'entityStatus',
        index: context.index,
        query: context.queryFilter,
        deleted: context.deleted,
        size: FACET_AGGREGATE_PAGE_SIZE,
      });
      const buckets = mapAggregateBuckets(response, 'entityStatus');
      hasReviewedEntityStatus.value = buckets.some(
        (bucket) => !isUnprocessedEntityStatus(bucket.key),
      );
    } catch {
      hasReviewedEntityStatus.value = true;
    }
  }

  function reset(): void {
    cancelSearch();
    generation += 1;
    chipFacets.value = {};
    searchingFacets.value = [];
  }

  return {
    chipFacets,
    searchingFacets,
    hasReviewedEntityStatus,
    loadOptions,
    searchOptions,
    cancelSearch,
    checkEntityStatus,
    rememberFacets,
    reset,
  };
}
