/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  buildSchemaQueryFilter,
  formatSearchQueryResponse,
  getSearchIndexForService,
  getServiceDisplayNameQueryFilter,
  getServiceNameQueryFilter,
  getTermQuery,
  searchServiceIndex,
  SERVICE_SEARCH_INDEX,
} from './serviceSearch';

describe('SERVICE_SEARCH_INDEX', () => {
  it('carries the pin camelCase wire values', () => {
    expect(SERVICE_SEARCH_INDEX).toEqual({
      ALL: 'all',
      DATABASE: 'database',
      TOPIC: 'topic',
      DASHBOARD: 'dashboard',
      PIPELINE: 'pipeline',
      MLMODEL: 'mlmodel',
      CONTAINER: 'container',
      SEARCH_INDEX: 'searchIndex',
      API_COLLECTION: 'apiCollection',
      DIRECTORY: 'directory',
      DASHBOARD_DATA_MODEL: 'dashboardDataModel',
      INGESTION_PIPELINE: 'ingestionPipeline',
      FILE: 'file',
      SPREADSHEET: 'spreadsheet',
    });
  });
});

describe('searchServiceIndex request mapping (pin rawSearchQuery)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ hits: { total: { value: 0 }, hits: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function lastRequest(): { url: URL; init?: RequestInit } {
    const call = vi.mocked(fetch).mock.calls.at(-1);
    if (!call) {
      throw new Error('fetch was not called');
    }
    return { url: new URL(String(call[0])), init: call[1] };
  }

  it('sends a GET with from/size derived from the 1-based page number', async () => {
    await searchServiceIndex({
      searchIndex: SERVICE_SEARCH_INDEX.DATABASE,
      pageNumber: 3,
      pageSize: 15,
    });
    const { url, init } = lastRequest();
    expect(init?.method ?? 'GET').toBe('GET');
    expect(url.pathname).toBe('/api/v1/search/query');
    expect(url.searchParams.get('index')).toBe('database');
    expect(url.searchParams.get('from')).toBe('30');
    expect(url.searchParams.get('size')).toBe('15');
    expect(url.searchParams.get('deleted')).toBe('false');
    expect(url.searchParams.get('q')).toBe('');
  });

  it('defaults to page 1 and size 10, clamping the page number at 1', async () => {
    await searchServiceIndex({ searchIndex: SERVICE_SEARCH_INDEX.TOPIC, pageNumber: 0 });
    const { url } = lastRequest();
    expect(url.searchParams.get('from')).toBe('0');
    expect(url.searchParams.get('size')).toBe('10');
  });

  it('sends the slash-escaped query, and an empty q for empty or ** queries', async () => {
    await searchServiceIndex({ searchIndex: SERVICE_SEARCH_INDEX.DATABASE, query: `o'clock` });
    expect(lastRequest().url.searchParams.get('q')).toBe(`o\\'clock`);
    await searchServiceIndex({ searchIndex: SERVICE_SEARCH_INDEX.DATABASE, query: '' });
    expect(lastRequest().url.searchParams.get('q')).toBe('');
    await searchServiceIndex({ searchIndex: SERVICE_SEARCH_INDEX.DATABASE, query: '**' });
    expect(lastRequest().url.searchParams.get('q')).toBe('');
  });

  it('serializes filters and forwards sort, tracking, and source flags', async () => {
    const queryFilter = { query: { match: { 'service.name.keyword': 'warehouse' } } };
    const postFilter = { query: { term: { deleted: false } } };
    await searchServiceIndex({
      searchIndex: SERVICE_SEARCH_INDEX.ALL,
      queryFilter,
      postFilter,
      sortField: 'name',
      sortOrder: 'asc',
      includeDeleted: true,
      trackTotalHits: true,
      fetchSource: false,
      pageSize: 0,
    });
    const { url } = lastRequest();
    expect(url.searchParams.get('query_filter')).toBe(JSON.stringify(queryFilter));
    expect(url.searchParams.get('post_filter')).toBe(JSON.stringify(postFilter));
    expect(url.searchParams.get('sort_field')).toBe('name');
    expect(url.searchParams.get('sort_order')).toBe('asc');
    expect(url.searchParams.get('deleted')).toBe('true');
    expect(url.searchParams.get('track_total_hits')).toBe('true');
    expect(url.searchParams.get('fetch_source')).toBe('false');
    expect(url.searchParams.get('size')).toBe('0');
  });

  it('omits unset optional parameters', async () => {
    await searchServiceIndex({ searchIndex: SERVICE_SEARCH_INDEX.FILE });
    const { url } = lastRequest();
    expect(url.searchParams.has('query_filter')).toBe(false);
    expect(url.searchParams.has('post_filter')).toBe(false);
    expect(url.searchParams.has('sort_field')).toBe(false);
    expect(url.searchParams.has('track_total_hits')).toBe(false);
    expect(url.searchParams.has('fetch_source')).toBe(false);
  });
});

describe('formatSearchQueryResponse (pin three-step normalization)', () => {
  it('strips nil values deeply, copies entityType to type, and strips sterms# keys', () => {
    const normalized = formatSearchQueryResponse({
      hits: {
        total: { value: 2, relation: 'eq' },
        hits: [
          {
            _source: {
              id: 'db1',
              name: 'sales',
              entityType: 'database',
              description: null,
              owners: [{ id: 'u1', name: null, displayName: 'Ann' }, null],
              extra: undefined,
            },
          },
          { _source: { id: 'db2', name: 'ops', entityType: 'database' } },
          { noSource: true },
        ],
      },
      aggregations: {
        'sterms#entityType': { buckets: [{ key: 'database', doc_count: 2 }] },
        plain: { buckets: [] },
      },
    });
    expect(normalized.total).toBe(2);
    expect(normalized.hits).toEqual([
      {
        id: 'db1',
        name: 'sales',
        entityType: 'database',
        type: 'database',
        owners: [{ id: 'u1', displayName: 'Ann' }],
      },
      { id: 'db2', name: 'ops', entityType: 'database', type: 'database' },
    ]);
    expect(normalized.aggregations).toEqual({
      entityType: { buckets: [{ key: 'database', doc_count: 2 }] },
      plain: { buckets: [] },
    });
  });

  it('leaves a source without entityType untouched and keeps empty objects', () => {
    const normalized = formatSearchQueryResponse({
      hits: {
        total: { value: 1 },
        hits: [{ _source: { id: 'x1', nested: {}, list: [] } }],
      },
    });
    expect(normalized.hits).toEqual([{ id: 'x1', nested: {}, list: [] }]);
    expect(normalized.aggregations).toBeUndefined();
  });

  it('reads a bare numeric total and tolerates a malformed envelope', () => {
    expect(formatSearchQueryResponse({ hits: { total: 5, hits: [] } }).total).toBe(5);
    expect(formatSearchQueryResponse(null)).toEqual({ hits: [], total: 0, aggregations: undefined });
    expect(formatSearchQueryResponse({})).toEqual({ hits: [], total: 0, aggregations: undefined });
  });
});

describe('getTermQuery (pin SearchPureUtils, verbatim)', () => {
  it('builds a must term query, fanning array values out', () => {
    expect(getTermQuery({ 'service.fullyQualifiedName.keyword': 'svc.db' })).toEqual({
      query: {
        bool: {
          must: [{ term: { 'service.fullyQualifiedName.keyword': 'svc.db' } }],
        },
      },
    });
    expect(getTermQuery({ status: ['a', 'b'] })).toEqual({
      query: {
        bool: {
          must: [{ term: { status: 'a' } }, { term: { status: 'b' } }],
        },
      },
    });
  });

  it('wraps owners.* fields in a nested query', () => {
    expect(getTermQuery({ 'owners.id': 'u1' })).toEqual({
      query: {
        bool: {
          must: [{ nested: { path: 'owners', query: { term: { 'owners.id': 'u1' } } } }],
        },
      },
    });
  });

  it('appends wildcard should-queries with minimum_should_match 1', () => {
    expect(
      getTermQuery({ a: 'b' }, 'must', undefined, {
        wildcardShouldQueries: { 'displayName.keyword': '*x*', 'name.keyword': '*x*' },
      }),
    ).toEqual({
      query: {
        bool: {
          must: [
            { term: { a: 'b' } },
            {
              bool: {
                should: [
                  { wildcard: { 'displayName.keyword': '*x*' } },
                  { wildcard: { 'name.keyword': '*x*' } },
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
    });
  });

  it('combines wildcard, match, and must_not clauses in pin order', () => {
    expect(
      getTermQuery({ a: 'b' }, 'must', undefined, {
        wildcardTerms: { w: '*v*' },
        matchTerms: { m: 'text' },
        mustNotTerms: { n: 'no' },
        wildcardMustNotQueries: { wn: ['*x*', '*y*'] },
      }),
    ).toEqual({
      query: {
        bool: {
          must: [
            { term: { a: 'b' } },
            { wildcard: { w: '*v*' } },
            { match: { m: 'text' } },
          ],
          must_not: [
            { term: { n: 'no' } },
            { wildcard: { wn: '*x*' } },
            { wildcard: { wn: '*y*' } },
          ],
        },
      },
    });
  });

  it('carries minimumShouldMatch only on a should query', () => {
    expect(getTermQuery({ a: 'b' }, 'should', 2)).toEqual({
      query: { bool: { should: [{ term: { a: 'b' } }], minimum_should_match: 2 } },
    });
    expect(getTermQuery({ a: 'b' }, 'must', 2)).toEqual({
      query: { bool: { must: [{ term: { a: 'b' } }] } },
    });
  });
});

describe('buildSchemaQueryFilter', () => {
  it('terms on the field alone without a search value', () => {
    expect(buildSchemaQueryFilter('service.fullyQualifiedName.keyword', 'svc.db')).toEqual({
      query: {
        bool: {
          must: [{ term: { 'service.fullyQualifiedName.keyword': 'svc.db' } }],
        },
      },
    });
  });

  it('adds displayName/name wildcard should-queries with a search value', () => {
    expect(
      buildSchemaQueryFilter('service.fullyQualifiedName.keyword', 'svc.db', 'sales'),
    ).toEqual({
      query: {
        bool: {
          must: [
            { term: { 'service.fullyQualifiedName.keyword': 'svc.db' } },
            {
              bool: {
                should: [
                  { wildcard: { 'displayName.keyword': '*sales*' } },
                  { wildcard: { 'name.keyword': '*sales*' } },
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
    });
  });
});

describe('service search helpers', () => {
  it('maps each kind to its child-entity index, defaulting to database', () => {
    expect(getSearchIndexForService('database')).toBe('database');
    expect(getSearchIndexForService('messaging')).toBe('topic');
    expect(getSearchIndexForService('dashboard')).toBe('dashboard');
    expect(getSearchIndexForService('pipeline')).toBe('pipeline');
    expect(getSearchIndexForService('mlmodel')).toBe('mlmodel');
    expect(getSearchIndexForService('storage')).toBe('container');
    expect(getSearchIndexForService('search')).toBe('searchIndex');
    expect(getSearchIndexForService('api')).toBe('apiCollection');
    expect(getSearchIndexForService('drive')).toBe('directory');
    expect(getSearchIndexForService('metadata')).toBe('database');
    expect(getSearchIndexForService('security')).toBe('database');
    expect(getSearchIndexForService('llm')).toBe('database');
    expect(getSearchIndexForService('mcp')).toBe('database');
  });

  it('builds the service name match filter on the name, not the FQN', () => {
    expect(getServiceNameQueryFilter('warehouse')).toEqual({
      query: { match: { 'service.name.keyword': 'warehouse' } },
    });
  });

  it('builds the displayName term filter wrapped in must', () => {
    expect(getServiceDisplayNameQueryFilter('Warehouse')).toEqual({
      query: {
        bool: {
          must: [
            {
              bool: {
                should: [{ term: { 'service.displayName.keyword': 'Warehouse' } }],
              },
            },
          ],
        },
      },
    });
  });
});
