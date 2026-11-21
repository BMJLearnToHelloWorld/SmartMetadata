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
  listDatabaseSchemas,
  mapDatabaseSchema,
  patchDatabaseSchema,
  searchDatabaseSchemas,
} from './databaseSchemas';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('databaseSchemas API (D-2 batch 3, pin DatabaseSchema.component)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe('mapDatabaseSchema', () => {
    it('maps name, display name, description, tags and the usage percentile', () => {
      expect(
        mapDatabaseSchema({
          id: 's1',
          name: 'public',
          displayName: 'Public',
          fullyQualifiedName: 'svc.db.public',
          description: 'Default schema',
          tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }],
          usageSummary: { weeklyStats: { percentileRank: 42 } },
        }),
      ).toEqual({
        id: 's1',
        name: 'public',
        displayName: 'Public',
        fullyQualifiedName: 'svc.db.public',
        description: 'Default schema',
        owners: undefined,
        domains: undefined,
        tags: [
          {
            tagFQN: 'PII.Sensitive',
            name: 'Sensitive',
            source: 'Classification',
            labelType: undefined,
            state: undefined,
          },
        ],
        usagePercentile: 42,
        deleted: false,
      });
    });

    it('returns null without a name and drops a nameless owner', () => {
      expect(mapDatabaseSchema({ id: 's1' })).toBeNull();
      expect(
        mapDatabaseSchema({ name: 'public', owners: [{ name: '' }, { name: 'alice', type: 'user' }] }),
      ).toMatchObject({ owners: [{ name: 'alice', type: 'user' }] });
    });
  });

  it('lists schemas for one database, defaulting include to non-deleted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ name: 'public' }, { name: 'private' }],
          paging: { total: 2, after: 'cursor-1' },
        }),
      ),
    );
    const page = await listDatabaseSchemas({ databaseName: 'svc.db' });
    const { url } = lastFetch();
    expect(url).toContain('/v1/databaseSchemas');
    expect(url).toContain('database=svc.db');
    expect(url).toContain('include=non-deleted');
    expect(page.data.map((item) => item.name)).toEqual(['public', 'private']);
    expect(page.paging).toEqual({ total: 2, after: 'cursor-1', before: undefined });
  });

  it('passes the after cursor and include=all through on later pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [], paging: {} })));
    await listDatabaseSchemas({ databaseName: 'svc.db', include: 'all', after: 'cursor-1' });
    const { url } = lastFetch();
    expect(url).toContain('include=all');
    expect(url).toContain('after=cursor-1');
  });

  it('searches the database_schema index scoped to the parent database', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [{ _source: { name: 'public' } }],
          },
        }),
      ),
    );
    const page = await searchDatabaseSchemas({ databaseFqn: 'svc.db', searchValue: 'pub' });
    const { url } = lastFetch();
    const query = new URL(url, 'http://localhost');
    expect(query.pathname).toContain('/v1/search/query');
    expect(query.searchParams.get('index')).toBe('database_schema');
    expect(query.searchParams.get('track_total_hits')).toBe('true');
    const filter = JSON.parse(query.searchParams.get('query_filter') ?? '{}') as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(filter)).toContain('svc.db');
    expect(JSON.stringify(filter)).toContain('pub');
    expect(page.data.map((item) => item.name)).toEqual(['public']);
    expect(page.paging.total).toBe(1);
  });

  it('PATCHes a schema display name as JSON Patch and maps the response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 's1', name: 'public', displayName: 'Public' })),
    );
    const row = await patchDatabaseSchema('s1', [
      { op: 'replace', path: '/displayName', value: 'Public' },
    ]);
    const { url, init } = lastFetch();
    expect(url).toContain('/v1/databaseSchemas/s1');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json-patch+json' });
    expect(JSON.parse(String(init?.body))).toEqual([
      { op: 'replace', path: '/displayName', value: 'Public' },
    ]);
    expect(row?.displayName).toBe('Public');
  });
});
