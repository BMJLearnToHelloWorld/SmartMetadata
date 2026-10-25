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
import { getLatestTableProfile, getTableSampleData, getTopicSampleData, listTableProfiles } from './profiler';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('profiler API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads table sample data from GET /v1/tables/{id}/sampleData', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ sampleData: { columns: ['id', 'name'], rows: [[1, 'a'], [2, 'b']] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const sample = await getTableSampleData('tbl-1');
    expect(sample.columns).toEqual(['id', 'name']);
    expect(sample.rows[0]).toEqual(['1', 'a']);
    expect(lastFetch().url).toContain('/api/v1/tables/tbl-1/sampleData');
  });

  it('reads topic sample data from GET /v1/topics/{id}/sampleData', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ sampleData: { messages: ['{"k":1}'] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const sample = await getTopicSampleData('top-1');
    expect(sample.messages).toEqual(['{"k":1}']);
    expect(lastFetch().url).toContain('/api/v1/topics/top-1/sampleData');
  });

  it('reads the latest table profile from GET /v1/tables/{fqn}/tableProfile/latest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            profile: { rowCount: 10, columnCount: 2, timestamp: 5 },
            columns: [{ name: 'id', profile: { nullCount: 0, uniqueCount: 10 } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const profile = await getLatestTableProfile('svc.db.schema.orders');
    expect(profile.rowCount).toBe(10);
    expect(profile.columns[0]?.name).toBe('id');
    expect(decodeURIComponent(lastFetch().url)).toContain('/api/v1/tables/svc.db.schema.orders/tableProfile/latest');
  });

  it('lists table profiles from GET /v1/tables/{fqn}/tableProfile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              { timestamp: 1, rowCount: 8, columnCount: 2 },
              { profile: { timestamp: 2, rowCount: 11 } },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const profiles = await listTableProfiles('svc.db.schema.orders', 10, 20);
    expect(profiles).toEqual([
      { timestamp: 1, rowCount: 8, columnCount: 2, columns: [] },
      { timestamp: 2, rowCount: 11, columnCount: undefined, columns: [] },
    ]);
    const url = decodeURIComponent(lastFetch().url);
    expect(url).toContain('/api/v1/tables/svc.db.schema.orders/tableProfile');
    expect(url).toContain('startTs=10');
    expect(url).toContain('endTs=20');
  });
});
