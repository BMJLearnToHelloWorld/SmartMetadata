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
import { createTestCase, listTestCases, updateTestCase } from './testCases';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('testCases API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists cases from GET /v1/dataQuality/testCases and can filter by entityFQN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                entityFQN: 'svc.db.schema.orders',
                testCaseResult: { testCaseStatus: 'Success', timestamp: 1 },
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestCases({ entityFQN: 'svc.db.schema.orders', includeAllTests: true });
    expect(page.data[0]?.testCaseResult?.testCaseStatus).toBe('Success');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases');
    expect(lastFetch().url).toContain('entityFQN=svc.db.schema.orders');
    expect(lastFetch().url).toContain('includeAllTests=true');
  });

  it('creates a case with schema-required name, testDefinition, and entityLink', async () => {
    const entityLink = toEntityLink('table', 'svc.db.schema.orders');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          name: 'row_count',
          testDefinition: 'tableRowCountToBeBetween',
          entityLink,
        });
        return new Response(JSON.stringify({ id: 'tc2', name: 'row_count', entityLink }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createTestCase({
      name: 'row_count',
      testDefinition: 'tableRowCountToBeBetween',
      entityLink,
      parameterValues: [
        { name: 'minValue', value: '1' },
        { name: 'maxValue', value: '100' },
      ],
    });
    expect(created.id).toBe('tc2');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('updates a case through PUT /v1/dataQuality/testCases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'tc2', name: 'row_count' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await updateTestCase({
      name: 'row_count',
      testDefinition: 'tableRowCountToBeBetween',
      entityLink: toEntityLink('table', 'svc.db.schema.orders'),
      description: 'Updated',
    });
    expect(lastFetch().init?.method).toBe('PUT');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases');
  });
});
