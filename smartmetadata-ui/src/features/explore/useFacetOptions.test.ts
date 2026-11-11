/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFacetOptions, type FacetOptionsContext } from './useFacetOptions';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FACET_BODY = {
  hits: { total: { value: 0 }, hits: [] },
  aggregations: {
    'sterms#entityType': {
      buckets: [
        { key: 'tag', doc_count: 17 },
        { key: 'metric', doc_count: 2 },
      ],
    },
    'sterms#service.displayName.keyword': {
      buckets: [
        { key: 'mysql', doc_count: 1 },
        { key: 'postgres', doc_count: 1 },
      ],
    },
  },
};

function fetchUrls(fetchMock: ReturnType<typeof vi.fn>): URL[] {
  return vi.mocked(fetchMock).mock.calls.map(([input]) => new URL(String(input), 'http://localhost'));
}

describe('useFacetOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches nothing when no filter narrows the facet (ADR:2026-11-11-explore-facet-self-exclusion)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FACET_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: 'orders',
      filters: {},
      index: 'dataAsset',
      deleted: false,
    }));
    await facetOptions.loadOptions('entityType');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(facetOptions.chipFacets.value.entityType).toBeUndefined();
  });

  it('fetches size-0 with the self-excluded query and keeps the unselected values', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FACET_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const context: FacetOptionsContext = {
      query: 'orders',
      filters: { entityType: ['tag'], service: ['mysql'] },
      index: 'dataAsset',
      deleted: false,
    };
    const facetOptions = useFacetOptions(() => context);
    await facetOptions.loadOptions('entityType');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchUrls(fetchMock)[0];
    expect(url.searchParams.get('size')).toBe('0');
    expect(url.searchParams.get('q')).toBe('orders AND service.displayName.keyword:mysql');
    expect(url.searchParams.get('q')).not.toContain('entityType:tag');
    expect(facetOptions.chipFacets.value.entityType?.buckets).toEqual([
      { key: 'tag', count: 17 },
      { key: 'metric', count: 2 },
    ]);
  });

  it('excludes the service filter when the service chip opens, keeping the entity type', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FACET_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: 'orders',
      filters: { entityType: ['tag'], service: ['mysql'] },
      index: 'dataAsset',
      deleted: false,
    }));
    await facetOptions.loadOptions('service');
    const url = fetchUrls(fetchMock)[0];
    expect(url.searchParams.get('q')).toBe('orders AND entityType:tag');
    expect(url.searchParams.get('q')).not.toContain('service.displayName.keyword:mysql');
    expect(facetOptions.chipFacets.value.service?.buckets).toEqual([
      { key: 'mysql', count: 1 },
      { key: 'postgres', count: 1 },
    ]);
  });

  it('reuses the cached options on a second open under the same context', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FACET_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: 'orders',
      filters: { entityType: ['tag'] },
      index: 'dataAsset',
      deleted: false,
    }));
    await facetOptions.loadOptions('entityType');
    await facetOptions.loadOptions('entityType');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the cached options when only the facet own selection changes', async () => {
    // Official's cache key is the self-excluded filter: the facet's own
    // selection is excluded from it, so changing it is a cache hit and
    // the options still carry both values.
    const fetchMock = vi.fn(async () => jsonResponse(FACET_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const context: FacetOptionsContext = {
      query: 'orders',
      filters: { entityType: ['tag'] },
      index: 'dataAsset',
      deleted: false,
    };
    const facetOptions = useFacetOptions(() => context);
    await facetOptions.loadOptions('entityType');
    context.filters = { entityType: ['metric'] };
    await facetOptions.loadOptions('entityType');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(facetOptions.chipFacets.value.entityType?.buckets).toEqual([
      { key: 'tag', count: 17 },
      { key: 'metric', count: 2 },
    ]);
  });

  it('refetches when another filter changes the context', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FACET_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const context: FacetOptionsContext = {
      query: 'orders',
      filters: { entityType: ['tag'] },
      index: 'dataAsset',
      deleted: false,
    };
    const facetOptions = useFacetOptions(() => context);
    await facetOptions.loadOptions('entityType');
    context.filters = { entityType: ['tag'], service: ['mysql'] };
    await facetOptions.loadOptions('entityType');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchUrls(fetchMock);
    expect(urls[1].searchParams.get('q')).toBe('orders AND service.displayName.keyword:mysql');
  });

  it('never caches an empty result, so the next open refetches', async () => {
    const emptyBody = {
      hits: { total: { value: 0 }, hits: [] },
      aggregations: { 'sterms#entityType': { buckets: [] } },
    };
    const fetchMock = vi.fn(async () => jsonResponse(emptyBody));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: '',
      filters: { entityType: ['tag'] },
      index: 'dataAsset',
      deleted: false,
    }));
    await facetOptions.loadOptions('entityType');
    await facetOptions.loadOptions('entityType');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // An empty fetch sets no per-facet override: the chips keep the
    // main-search facets, which are empty for this facet too.
    expect(facetOptions.chipFacets.value.entityType).toBeUndefined();
  });

  it('restores a selected value the fetch omits from the seen map', async () => {
    const metricOnlyBody = {
      hits: { total: { value: 0 }, hits: [] },
      aggregations: {
        'sterms#entityType': { buckets: [{ key: 'metric', doc_count: 2 }] },
      },
    };
    const fetchMock = vi.fn(async () => jsonResponse(metricOnlyBody));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: '',
      filters: { entityType: ['tag'] },
      index: 'dataAsset',
      deleted: false,
    }));
    // The main search's narrowed facets carry the selected value.
    facetOptions.rememberFacets([
      { id: 'entityType', field: 'entityType', buckets: [{ key: 'tag', count: 17 }] },
    ]);
    await facetOptions.loadOptions('entityType');
    expect(facetOptions.chipFacets.value.entityType?.buckets).toEqual([
      { key: 'metric', count: 2 },
      { key: 'tag', count: 17 },
    ]);
  });

  it('reset drops the per-facet overrides but the cache survives', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FACET_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: 'orders',
      filters: { entityType: ['tag'] },
      index: 'dataAsset',
      deleted: false,
    }));
    await facetOptions.loadOptions('entityType');
    expect(facetOptions.chipFacets.value.entityType).toBeDefined();
    facetOptions.reset();
    expect(facetOptions.chipFacets.value.entityType).toBeUndefined();
    await facetOptions.loadOptions('entityType');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(facetOptions.chipFacets.value.entityType?.buckets).toEqual([
      { key: 'tag', count: 17 },
      { key: 'metric', count: 2 },
    ]);
  });
});
