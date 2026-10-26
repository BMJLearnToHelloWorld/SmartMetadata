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
import { createTestSuite, isTestSuiteSearchListAvailable, listTestSuites, listTestSuitesBySearch, updateTestSuite } from './testSuites';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('testSuites API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists suites from GET /v1/dataQuality/testSuites', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'ts1', name: 'Critical tables', basic: false, summary: { failed: 2, success: 8 } }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestSuites({ limit: 25 });
    expect(page.data[0]?.summary?.failed).toBe(2);
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testSuites');
  });

  it('creates a logical suite through POST /v1/dataQuality/testSuites', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { name?: string };
        expect(body.name).toBe('Nightly');
        return new Response(JSON.stringify({ id: 'ts2', name: 'Nightly', basic: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createTestSuite({ name: 'Nightly', description: 'Nightly logical suite' });
    expect(created.id).toBe('ts2');
    expect(lastFetch().init?.method).toBe('POST');
    expect(lastFetch().url).toMatch(/\/api\/v1\/dataQuality\/testSuites$/);
  });

  it('updates a logical suite through PUT /v1/dataQuality/testSuites', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'ts2', name: 'Nightly' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await updateTestSuite({ name: 'Nightly', description: 'Updated' });
    expect(lastFetch().init?.method).toBe('PUT');
  });

  it('lists via GET /v1/dataQuality/testSuites/search/list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: 'ts1', name: 'Critical' }], paging: { total: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const page = await listTestSuitesBySearch({ q: 'Critical', testSuiteType: 'logical' });
    expect(page.data[0]?.name).toBe('Critical');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testSuites/search/list');
    expect(lastFetch().url).toContain('testSuiteType=logical');
  });

  it('treats suite search/list 404 as residual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(isTestSuiteSearchListAvailable()).resolves.toBe(false);
  });
});
