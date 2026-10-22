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
import { listActivityEvents, listEntityActivity, replyToActivity } from './activity';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('activity API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists the global feed from GET /v1/activity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'act-1',
                eventType: 'DescriptionUpdated',
                summary: 'Updated description',
                timestamp: 1,
                entity: { id: 'tbl-1', name: 'orders', type: 'table' },
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listActivityEvents({ days: 7, limit: 50 });
    expect(page.data[0]?.eventType).toBe('DescriptionUpdated');
    expect(lastFetch().url).toContain('/api/v1/activity');
    expect(lastFetch().url).toContain('days=7');
    expect(lastFetch().url).not.toContain('/v1/feed');
  });

  it('lists entity activity from GET /v1/activity/entity/{type}/name/{fqn}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: 'act-2', eventType: 'EntityUpdated', timestamp: 2 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const page = await listEntityActivity('table', 'svc.db.schema.orders');
    expect(page.data[0]?.id).toBe('act-2');
    expect(lastFetch().url).toContain(
      `/api/v1/activity/entity/table/name/${encodeURIComponent('svc.db.schema.orders')}`,
    );
  });

  it('replies to an activity with POST /v1/activity/{id}/replies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toEqual({ message: 'looks good' });
        return new Response(
          JSON.stringify({ id: 'r1', conversationId: 'c1', message: 'looks good' }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const reply = await replyToActivity('act-1', { message: 'looks good' });
    expect(reply.id).toBe('r1');
    expect(lastFetch().url).toContain('/api/v1/activity/act-1/replies');
    expect(lastFetch().init?.method).toBe('POST');
  });
});
