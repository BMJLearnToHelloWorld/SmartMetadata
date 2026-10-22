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
import { createTestDefinition, listTestDefinitions, updateTestDefinition } from './testDefinitions';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('testDefinitions API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists definitions from GET /v1/dataQuality/testDefinitions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'td1', name: 'tableRowCountToBeBetween', entityType: 'TABLE', testPlatforms: ['OpenMetadata'] }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestDefinitions({ limit: 50 });
    expect(page.data[0]?.name).toBe('tableRowCountToBeBetween');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testDefinitions');
  });

  it('creates a definition with schema-required name, entityType, and testPlatforms', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          name: 'customSql',
          entityType: 'TABLE',
          testPlatforms: ['OpenMetadata'],
        });
        return new Response(JSON.stringify({ id: 'td2', name: 'customSql', entityType: 'TABLE', testPlatforms: ['OpenMetadata'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createTestDefinition({
      name: 'customSql',
      entityType: 'TABLE',
      testPlatforms: ['OpenMetadata'],
      description: 'Custom SQL check',
    });
    expect(created.id).toBe('td2');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('updates a definition through PUT /v1/dataQuality/testDefinitions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'td2', name: 'customSql', entityType: 'TABLE', testPlatforms: ['OpenMetadata'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await updateTestDefinition({
      name: 'customSql',
      entityType: 'TABLE',
      testPlatforms: ['OpenMetadata'],
      description: 'Updated',
    });
    expect(lastFetch().init?.method).toBe('PUT');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testDefinitions');
  });
});
