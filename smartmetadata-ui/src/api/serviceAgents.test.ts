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
  isOpenMetadataService,
  listServiceAgents,
  resolveAgentsFetchMode,
  resolveAgentsPageChange,
  resolveAgentsRefreshMode,
  searchServiceAgents,
  SERVICE_INGESTION_PIPELINE_TYPES,
} from './serviceAgents';

describe('service agents constants', () => {
  it('lists the eight pin agent types in pin order', () => {
    expect([...SERVICE_INGESTION_PIPELINE_TYPES]).toEqual([
      'metadata',
      'usage',
      'lineage',
      'profiler',
      'autoClassification',
      'dbt',
      'policyAgent',
      'reverseMetadata',
    ]);
  });

  it('identifies only the OpenMetadata service FQN', () => {
    expect(isOpenMetadataService('OpenMetadata')).toBe(true);
    expect(isOpenMetadataService('openmetadata')).toBe(false);
    expect(isOpenMetadataService('OpenMetadata.child')).toBe(false);
  });
});

describe('listServiceAgents (pin getAllIngestionWorkflows)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [], paging: { total: 0 } }), {
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

  function lastUrl(): URL {
    const call = vi.mocked(fetch).mock.calls.at(-1);
    if (!call) {
      throw new Error('fetch was not called');
    }
    return new URL(String(call[0]));
  }

  it('sends fields, service FQN, service type, agentType, and limit', async () => {
    await listServiceAgents({ serviceFqn: 'pg.warehouse', kind: 'database', pageSize: 15 });
    const url = lastUrl();
    expect(url.pathname).toBe('/api/v1/services/ingestionPipelines');
    expect(url.searchParams.get('fields')).toBe('owners,pipelineStatuses');
    expect(url.searchParams.get('service')).toBe('pg.warehouse');
    expect(url.searchParams.get('serviceType')).toBe('databaseService');
    expect(url.searchParams.get('agentType')).toBe('metadata');
    expect(url.searchParams.get('limit')).toBe('15');
    expect(url.searchParams.has('after')).toBe(false);
    expect(url.searchParams.has('before')).toBe(false);
  });

  it('forwards after and before cursors', async () => {
    await listServiceAgents({
      serviceFqn: 'pg.warehouse',
      kind: 'database',
      pageSize: 15,
      cursor: { type: 'after', value: 'next' },
    });
    expect(lastUrl().searchParams.get('after')).toBe('next');
    await listServiceAgents({
      serviceFqn: 'pg.warehouse',
      kind: 'database',
      pageSize: 15,
      cursor: { type: 'before', value: 'prev' },
    });
    expect(lastUrl().searchParams.get('before')).toBe('prev');
    expect(lastUrl().searchParams.has('after')).toBe(false);
  });
});

describe('searchServiceAgents (pin searchPipelines)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function lastUrl(): URL {
    const call = vi.mocked(fetch).mock.calls.at(-1);
    if (!call) {
      throw new Error('fetch was not called');
    }
    return new URL(String(call[0]));
  }

  function stubSearch(payload: unknown): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  }

  it('defaults an empty type filter to all eight types as should terms', async () => {
    stubSearch({ hits: { total: { value: 0 }, hits: [] } });
    await searchServiceAgents({
      searchText: '',
      page: 1,
      pageSize: 15,
      serviceDisplayName: 'Warehouse',
      typeFilter: [],
      statusFilter: [],
    });
    const url = lastUrl();
    expect(url.pathname).toBe('/api/v1/search/query');
    expect(url.searchParams.get('index')).toBe('ingestionPipeline');
    expect(url.searchParams.get('from')).toBe('0');
    expect(url.searchParams.get('size')).toBe('15');
    expect(url.searchParams.has('track_total_hits')).toBe(false);
    const filter = JSON.parse(url.searchParams.get('query_filter') ?? '{}') as {
      query: { bool: { must: unknown[] } };
    };
    expect(filter.query.bool.must).toHaveLength(2);
    expect(filter.query.bool.must[0]).toEqual({
      bool: { should: [{ term: { 'service.displayName.keyword': 'Warehouse' } }] },
    });
    expect(filter.query.bool.must[1]).toEqual({
      bool: {
        should: [...SERVICE_INGESTION_PIPELINE_TYPES].map((type) => ({
          term: { pipelineType: type },
        })),
        minimum_should_match: 1,
      },
    });
  });

  it('combines selected types and statuses in pin clause order', async () => {
    stubSearch({ hits: { total: { value: 0 }, hits: [] } });
    await searchServiceAgents({
      searchText: 'nightly',
      page: 2,
      pageSize: 15,
      serviceDisplayName: 'Warehouse',
      typeFilter: ['metadata', 'profiler'],
      statusFilter: ['success', 'failed'],
    });
    const url = lastUrl();
    expect(url.searchParams.get('from')).toBe('15');
    const filter = JSON.parse(url.searchParams.get('query_filter') ?? '{}') as {
      query: { bool: { must: unknown[] } };
    };
    expect(filter.query.bool.must).toHaveLength(3);
    expect(filter.query.bool.must[1]).toEqual({
      bool: {
        should: [{ term: { pipelineType: 'metadata' } }, { term: { pipelineType: 'profiler' } }],
        minimum_should_match: 1,
      },
    });
    expect(filter.query.bool.must[2]).toEqual({
      bool: {
        should: [
          { term: { 'pipelineStatuses.pipelineState': 'success' } },
          { term: { 'pipelineStatuses.pipelineState': 'failed' } },
        ],
        minimum_should_match: 1,
      },
    });
  });

  it('wraps the escaped, encoded search text in wildcards', async () => {
    stubSearch({ hits: { total: { value: 0 }, hits: [] } });
    await searchServiceAgents({
      searchText: 'a+b/c',
      page: 1,
      pageSize: 15,
      serviceDisplayName: 'Warehouse',
      typeFilter: [],
      statusFilter: [],
    });
    // escapeESReservedCharacters escapes + and /; getEncodedFqn then
    // percent-encodes the backslashes; getQueryWithSlash leaves the
    // result untouched (no quotes involved).
    expect(lastUrl().searchParams.get('q')).toBe('*a%5C%2Bb%5C%2Fc*');
  });

  it('maps hit sources through the pipeline mapper with total-only paging', async () => {
    stubSearch({
      hits: {
        total: { value: 2 },
        hits: [
          { _source: { id: 'p1', name: 'pg-metadata', pipelineType: 'metadata' } },
          { _source: { id: 'p2', name: 'pg-profiler', pipelineType: 'profiler' } },
          { _source: { description: 'no identity' } },
        ],
      },
    });
    const page = await searchServiceAgents({
      searchText: '',
      page: 1,
      pageSize: 15,
      serviceDisplayName: 'Warehouse',
      typeFilter: [],
      statusFilter: [],
    });
    expect(page.total).toBe(2);
    expect(page.data.map((pipeline) => pipeline.name)).toEqual(['pg-metadata', 'pg-profiler']);
    expect(page.after).toBeUndefined();
    expect(page.before).toBeUndefined();
  });
});

describe('agents fetch scheduling (pin asymmetries preserved)', () => {
  it('effect: OpenMetadata skips; empty filters list; any filter searches', () => {
    expect(
      resolveAgentsFetchMode({
        searchText: '',
        typeFilter: [],
        statusFilter: [],
        isOpenMetadata: true,
      }),
    ).toBe('skip');
    expect(
      resolveAgentsFetchMode({
        searchText: 'x',
        typeFilter: [],
        statusFilter: [],
        isOpenMetadata: true,
      }),
    ).toBe('skip');
    expect(
      resolveAgentsFetchMode({
        searchText: '',
        typeFilter: [],
        statusFilter: [],
        isOpenMetadata: false,
      }),
    ).toBe('list');
    expect(
      resolveAgentsFetchMode({
        searchText: 'x',
        typeFilter: [],
        statusFilter: [],
        isOpenMetadata: false,
      }),
    ).toBe('search');
    expect(
      resolveAgentsFetchMode({
        searchText: '',
        typeFilter: ['metadata'],
        statusFilter: [],
        isOpenMetadata: false,
      }),
    ).toBe('search');
    expect(
      resolveAgentsFetchMode({
        searchText: '',
        typeFilter: [],
        statusFilter: ['failed'],
        isOpenMetadata: false,
      }),
    ).toBe('search');
  });

  it('refresh: search text alone decides, with no OpenMetadata guard', () => {
    expect(resolveAgentsRefreshMode('')).toBe('list');
    expect(resolveAgentsRefreshMode('nightly')).toBe('search');
  });

  it('page change: cursor lists, else search text searches, else nothing', () => {
    expect(
      resolveAgentsPageChange({ cursorType: 'after', cursorValue: 'next', searchText: 'x' }),
    ).toEqual({ kind: 'cursor-list', cursor: { type: 'after', value: 'next' } });
    expect(resolveAgentsPageChange({ cursorType: 'before', cursorValue: 'prev', searchText: '' })).toEqual(
      { kind: 'cursor-list', cursor: { type: 'before', value: 'prev' } },
    );
    expect(resolveAgentsPageChange({ searchText: 'nightly' })).toEqual({ kind: 'search' });
    expect(resolveAgentsPageChange({ searchText: '' })).toEqual({ kind: 'none' });
  });
});
