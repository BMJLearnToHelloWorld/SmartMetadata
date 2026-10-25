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
import { getEntityUsage } from './usage';

function lastFetch(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

describe('usage API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads dailyStats from GET /v1/usage/{type}/name/{fqn}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            usage: [
              { date: '2026-01-02', dailyStats: { count: 4 } },
              { date: '2026-01-01', dailyStats: { count: 1 } },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const days = await getEntityUsage('table', 'svc.db.schema.orders', 30);
    expect(days).toEqual([
      { date: '2026-01-02', count: 4 },
      { date: '2026-01-01', count: 1 },
    ]);
    const url = decodeURIComponent(lastFetch());
    expect(url).toContain('/api/v1/usage/table/name/svc.db.schema.orders');
    expect(url).toContain('days=30');
  });

  it('returns an empty series on 404 instead of inventing counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 })),
    );
    await expect(getEntityUsage('table', 'missing.table')).resolves.toEqual([]);
  });
});
