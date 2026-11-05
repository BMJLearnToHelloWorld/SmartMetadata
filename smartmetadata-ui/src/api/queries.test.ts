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
import { getQueryById, postQuery } from './queries';

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
          service: 'warehouse',
          votes: { upVotes: 3, downVotes: 1 },
          queryUsedIn: [{ id: 't2', type: 'table', name: 'customers' }],
        });
      }),
    );
    const query = await getQueryById('q1');
    expect(query.query).toBe('select * from orders');
    expect(query.votes).toEqual({ upVotes: 3, downVotes: 1 });
    expect(query.queryUsedIn).toHaveLength(1);
    expect(calls[0]).toContain('/api/v1/queries/q1');
    expect(calls[0]).toContain('fields=votes');
    expect(calls[0]).toContain('queryUsedIn');
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
