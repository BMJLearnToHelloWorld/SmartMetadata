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
import { toEntityLink } from '@/quality/entityLink';
import { createAnnouncement, listAnnouncements } from './announcements';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('announcements API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists announcements from GET /v1/announcements', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'a1', displayName: 'Maintenance', description: 'Window', type: 'Notice' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listAnnouncements({ limit: 50 });
    expect(page.data[0]?.displayName).toBe('Maintenance');
    expect(lastFetch().url).toContain('/api/v1/announcements');
  });

  it('creates an announcement with schema-required description, startTime, and endTime', async () => {
    const entityLink = toEntityLink('table', 'svc.db.schema.orders');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          description: 'Table rebuild',
          startTime: 100,
          endTime: 200,
          type: 'Notice',
          entityLink,
        });
        return new Response(JSON.stringify({ id: 'a2', description: 'Table rebuild' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createAnnouncement({
      description: 'Table rebuild',
      startTime: 100,
      endTime: 200,
      type: 'Notice',
      entityLink,
    });
    expect(created.id).toBe('a2');
    expect(lastFetch().init?.method).toBe('POST');
    expect(lastFetch().url).toContain('/api/v1/announcements');
  });
});
