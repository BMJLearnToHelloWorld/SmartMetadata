/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  deleteQuery,
  getQueryById,
  getQueryCount,
  getQueryDetails,
  mapQuery,
  mapQuerySearchPage,
  patchQuery,
  postQuery,
  voteQuery,
} from './queries';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('queries API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('gets a query by id with votes and queryUsedIn fields (A16)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse({
          id: 'q1',
          query: 'select * from orders',
          service: { id: 'svc-1', type: 'databaseService', name: 'warehouse' },
          votes: {
            upVotes: 3,
            downVotes: 1,
            upVoters: [{ id: 'u1', name: 'alice', type: 'user' }],
            downVoters: [],
          },
          queryUsedIn: [{ id: 't2', type: 'table', name: 'customers' }],
          users: [{ id: 'u2', name: 'bob', type: 'user' }],
          usedBy: ['external-etl'],
          tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Generated' }],
          updatedAt: 1710000000000,
        });
      }),
    );
    const query = await getQueryById('q1');
    expect(query.query).toBe('select * from orders');
    expect(query.service).toEqual({ id: 'svc-1', type: 'databaseService', name: 'warehouse' });
    expect(query.votes).toEqual({
      upVotes: 3,
      downVotes: 1,
      upVoters: [{ id: 'u1', name: 'alice', type: 'user' }],
      downVoters: [],
    });
    expect(query.queryUsedIn).toHaveLength(1);
    expect(query.users).toHaveLength(1);
    expect(query.usedBy).toEqual(['external-etl']);
    expect(query.tags).toEqual([
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Generated' },
    ]);
    expect(query.updatedAt).toBe(1710000000000);
    expect(calls[0]).toContain('/api/v1/queries/q1');
    expect(calls[0]).toContain('fields=votes');
    expect(calls[0]).toContain('queryUsedIn');
  });

  it('reads the full field set for the right panel and post-vote refetch', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse({ id: 'q1', query: 'select 1' });
      }),
    );
    await getQueryDetails('q1');
    expect(calls[0]).toContain('fields=owners%2Cvotes%2Ctags%2CqueryUsedIn%2Cusers');
  });

  it('counts queries with limit=0 plus entityId and entityType', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse({ data: [], paging: { total: 7 } });
      }),
    );
    expect(await getQueryCount('tbl-1')).toBe(7);
    expect(calls[0]).toContain('/api/v1/queries?');
    expect(calls[0]).toContain('limit=0');
    expect(calls[0]).toContain('entityId=tbl-1');
    expect(calls[0]).toContain('entityType=table');
  });

  it('patches with the JSON Patch media type and maps the response', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ id: 'q1', query: 'select 2', description: 'updated' });
      }),
    );
    const patched = await patchQuery('q1', [{ op: 'replace', path: '/description', value: 'updated' }]);
    expect(patched.description).toBe('updated');
    expect(calls[0]?.url).toContain('/api/v1/queries/q1');
    expect(calls[0]?.init?.method).toBe('PATCH');
    expect((calls[0]?.init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json-patch+json',
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual([
      { op: 'replace', path: '/description', value: 'updated' },
    ]);
  });

  it('votes then refetches by id with the full field set', async () => {
    const calls: string[] = [];
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(String(input));
        if (init?.body) {
          bodies.push(JSON.parse(String(init.body)));
        }
        if (String(input).includes('/vote')) {
          return jsonResponse({ eventType: 'EntityUpdated' });
        }
        return jsonResponse({ id: 'q1', query: 'select 1', votes: { upVotes: 4, downVotes: 0 } });
      }),
    );
    const voted = await voteQuery('q1', 'votedUp');
    expect(voted.votes?.upVotes).toBe(4);
    expect(calls[0]).toContain('/api/v1/queries/q1/vote');
    expect(bodies[0]).toEqual({ updatedVoteType: 'votedUp' });
    expect(calls[1]).toContain('fields=owners%2Cvotes%2Ctags%2CqueryUsedIn%2Cusers');
  });

  it('deletes by id', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response('', { status: 200 });
      }),
    );
    await deleteQuery('q1');
    expect(calls[0]?.url).toContain('/api/v1/queries/q1');
    expect(calls[0]?.init?.method).toBe('DELETE');
  });

  it('maps search hits from _source and reads the total value', () => {
    const page = mapQuerySearchPage({
      hits: {
        total: { value: 2, relation: 'eq' },
        hits: [
          {
            _source: {
              id: 'q1',
              query: 'select 1',
              queryDate: 1710000000000,
              duration: 1500,
              votes: { upVotes: 1, downVotes: 0, upVoters: [{ id: 'u1', name: 'alice' }] },
              queryUsedIn: [{ id: 't1', type: 'table', name: 'orders' }],
            },
          },
          { _source: { id: 'q2', query: 'select 2' } },
          { _source: {} },
        ],
      },
    });
    expect(page.total).toBe(2);
    expect(page.queries).toHaveLength(2);
    expect(page.queries[0]?.duration).toBe(1500);
    expect(page.queries[0]?.votes?.upVoters).toHaveLength(1);
    expect(mapQuerySearchPage({})).toEqual({ total: 0, queries: [] });
  });

  it('carries a tag label state through the mapper so a later save cannot flip Suggested', () => {
    const mapped = mapQuery({
      id: 'q1',
      query: 'select 1',
      tags: [
        { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Generated', state: 'Suggested' },
        { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual', state: 'Bogus' },
        { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
      ],
    });
    expect(mapped?.tags).toEqual([
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Generated', state: 'Suggested' },
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual', state: undefined },
      { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification', labelType: undefined, state: undefined },
    ]);
  });

  it('drops labelType values outside the five-value union (shared TAG_LABEL_TYPES)', () => {
    // Parity with entities.mapTags: both mappers read the same exported
    // const, so a value the union rejects is dropped on either path.
    const mapped = mapQuery({
      id: 'q1',
      query: 'select 1',
      tags: [
        { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Bogus' },
        { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'generated' },
        { tagFQN: 'PII.Phone', name: 'Phone', source: 'Classification', labelType: 'Propagated' },
      ],
    });
    expect(mapped?.tags).toEqual([
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: undefined, state: undefined },
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: undefined, state: undefined },
      { tagFQN: 'PII.Phone', name: 'Phone', source: 'Classification', labelType: 'Propagated', state: undefined },
    ]);
  });

  it('posts a CreateQuery payload (A16)', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ id: 'q2', query: 'select 1', service: 'warehouse' });
      }),
    );
    const created = await postQuery({
      query: 'select 1',
      service: 'warehouse',
      owners: [{ id: 'u1', type: 'user' }],
      queryUsedIn: [{ id: 't2', type: 'table' }],
      queryDate: 1700000000000,
    });
    expect(created.id).toBe('q2');
    expect(bodies[0]).toMatchObject({
      query: 'select 1',
      service: 'warehouse',
      owners: [{ id: 'u1', type: 'user' }],
      queryUsedIn: [{ id: 't2', type: 'table' }],
      queryDate: 1700000000000,
    });
  });
});
