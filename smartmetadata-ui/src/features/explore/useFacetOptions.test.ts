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
import { NULL_OPTION_KEY } from '@/catalog/searchFacets';
import { isUnprocessedEntityStatus, useFacetOptions, type FacetOptionsContext } from './useFacetOptions';

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

function postBodies(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return vi
    .mocked(fetchMock)
    .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body ?? '{}')) as Record<string, unknown>);
}

const AGGREGATE_COLUMN_BODY = {
  aggregations: {
    'sterms#columns.name.keyword': {
      buckets: [
        { key: 'order_id', doc_count: 5 },
        { key: 'customer_id', doc_count: 3 },
      ],
    },
  },
};

const AGGREGATE_STATUS_BODY = (buckets: Array<{ key: string; doc_count: number }>) => ({
  aggregations: { 'sterms#entityStatus': { buckets } },
});

describe('useFacetOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

describe('useFacetOptions aggregate-sourced facets (D5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches initial options for a column facet from POST /v1/search/aggregate', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(AGGREGATE_COLUMN_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: 'orders',
      filters: {},
      index: 'table',
      deleted: false,
    }));
    await facetOptions.loadOptions('column');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchUrls(fetchMock)[0].pathname).toBe('/api/v1/search/aggregate');
    const [body] = postBodies(fetchMock);
    expect(body.fieldName).toBe('columns.name.keyword');
    expect(body.fieldValue).toBe('.*');
    expect(body.index).toBe('table');
    expect(body.queryText).toBe('orders');
    expect(body.size).toBe(10);
    expect(facetOptions.chipFacets.value.column?.buckets).toEqual([
      { key: 'order_id', count: 5 },
      { key: 'customer_id', count: 3 },
    ]);
    expect(facetOptions.searchingFacets.value).toEqual([]);
  });

  it('sends a facet own null selection only through the other facets query_filter', async () => {
    const bodyWithOwner = {
      hits: { total: { value: 0 }, hits: [] },
      aggregations: {
        'sterms#ownerDisplayName': {
          buckets: [{ key: 'alice', doc_count: 1 }],
        },
      },
    };
    const fetchMock = vi.fn(async () => jsonResponse(bodyWithOwner));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: 'orders',
      filters: { owner: [NULL_OPTION_KEY], domain: [NULL_OPTION_KEY], service: ['mysql'] },
      index: 'dataAsset',
      deleted: false,
    }));
    await facetOptions.loadOptions('owner');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchUrls(fetchMock)[0];
    // The Lucene q carries no null sentinel at all.
    expect(url.searchParams.get('q')).toBe('orders AND service.displayName.keyword:mysql');
    // The query_filter carries the domain null clause but not the owner
    // one: the owner dropdown must not narrow by its own selection.
    const queryFilter = url.searchParams.get('query_filter') ?? '';
    expect(queryFilter).toContain('domains.displayName.keyword');
    expect(queryFilter).not.toContain('ownerDisplayName');
    expect(facetOptions.chipFacets.value.owner?.buckets).toEqual([{ key: 'alice', count: 1 }]);
  });
});

describe('useFacetOptions debounced dropdown search (D6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('waits 500ms and sends one aggregate search for rapid keystrokes', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse(AGGREGATE_COLUMN_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: '',
      filters: {},
      index: 'table',
      deleted: false,
    }));
    facetOptions.searchOptions('column', 'o');
    facetOptions.searchOptions('column', 'or');
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = postBodies(fetchMock);
    expect(body.fieldName).toBe('columns.name.keyword');
    expect(body.fieldValue).toBe('.*or.*');
    expect(facetOptions.chipFacets.value.column?.buckets).toEqual([
      { key: 'order_id', count: 5 },
      { key: 'customer_id', count: 3 },
    ]);
  });

  it('cancels a pending search when the dropdown closes', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse(AGGREGATE_COLUMN_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: '',
      filters: {},
      index: 'table',
      deleted: false,
    }));
    facetOptions.searchOptions('column', 'ord');
    facetOptions.cancelSearch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the initial options when the search text is cleared', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse(AGGREGATE_COLUMN_BODY));
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: '',
      filters: {},
      index: 'table',
      deleted: false,
    }));
    facetOptions.searchOptions('column', '');
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postBodies(fetchMock)[0].fieldValue).toBe('.*');
  });
});

describe('useFacetOptions entity-status gate (D9)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports reviewed status only when some bucket left Unprocessed', async () => {
    const reviewedMock = vi.fn(async () => jsonResponse(AGGREGATE_STATUS_BODY([
      { key: 'Unprocessed', doc_count: 9 },
      { key: 'Approved', doc_count: 1 },
    ])));
    vi.stubGlobal('fetch', reviewedMock);
    const reviewed = useFacetOptions(() => ({
      query: '',
      filters: {},
      index: 'glossaryTerm',
      deleted: false,
    }));
    await reviewed.checkEntityStatus();
    expect(reviewed.hasReviewedEntityStatus.value).toBe(true);
    const [body] = postBodies(reviewedMock);
    expect(body.fieldName).toBe('entityStatus');
    expect(body.index).toBe('glossaryTerm');

    const unprocessedMock = vi.fn(async () => jsonResponse(AGGREGATE_STATUS_BODY([
      { key: 'Unprocessed', doc_count: 9 },
    ])));
    vi.stubGlobal('fetch', unprocessedMock);
    const unprocessed = useFacetOptions(() => ({
      query: '',
      filters: {},
      index: 'glossaryTerm',
      deleted: false,
    }));
    await unprocessed.checkEntityStatus();
    expect(unprocessed.hasReviewedEntityStatus.value).toBe(false);
  });

  it('fails open when the status check errors', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('down');
    });
    vi.stubGlobal('fetch', fetchMock);
    const facetOptions = useFacetOptions(() => ({
      query: '',
      filters: {},
      index: 'glossaryTerm',
      deleted: false,
    }));
    await facetOptions.checkEntityStatus();
    expect(facetOptions.hasReviewedEntityStatus.value).toBe(true);
  });

  it('treats a missing status as Unprocessed', () => {
    expect(isUnprocessedEntityStatus('')).toBe(true);
    expect(isUnprocessedEntityStatus('Unprocessed')).toBe(true);
    expect(isUnprocessedEntityStatus('unprocessed')).toBe(true);
    expect(isUnprocessedEntityStatus('Approved')).toBe(false);
    expect(isUnprocessedEntityStatus('Draft')).toBe(false);
  });
});
