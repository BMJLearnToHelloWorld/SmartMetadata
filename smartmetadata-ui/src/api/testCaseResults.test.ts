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
import { listTestCaseResults } from './testCaseResults';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('testCaseResults API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists results from GET /v1/dataQuality/testCases/testCaseResults/{fqn}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ testCaseStatus: 'Failed', result: 'row count 0', timestamp: 99 }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestCaseResults('svc.db.schema.orders.row_count');
    expect(page.data[0]?.testCaseStatus).toBe('Failed');
    expect(decodeURIComponent(lastFetch().url)).toContain(
      '/api/v1/dataQuality/testCases/testCaseResults/svc.db.schema.orders.row_count',
    );
  });

  it('maps testResultValue entries so the detail view can render measured diff values (P2-6)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                testCaseStatus: 'Failed',
                timestamp: 99,
                testResultValue: [
                  { name: 'removedRows', value: '1' },
                  { name: 'addedRows', value: '2' },
                  { name: 'diffCount', value: '3' },
                ],
              },
              { testCaseStatus: 'Success', timestamp: 100 },
            ],
            paging: { total: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestCaseResults('svc.db.schema.orders.table_diff');
    expect(page.data[0]?.testResultValue).toEqual([
      { name: 'removedRows', value: '1' },
      { name: 'addedRows', value: '2' },
      { name: 'diffCount', value: '3' },
    ]);
    expect(page.data[1]?.testResultValue).toBeUndefined();
  });
});
