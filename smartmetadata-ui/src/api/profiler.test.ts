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
import { getLatestTableProfile, getTableProfilerConfig, getTableSampleData, getTopicSampleData, listTableProfiles, putTableProfilerConfig } from './profiler';

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

  it('maps all 31 computed column fields plus the table extras', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            profile: {
              rowCount: 10,
              columnCount: 2,
              timestamp: 5,
              sizeInByte: 16384,
              createDateTime: '2026-01-02T03:04:05Z',
              profileSample: 50,
              profileSampleType: 'PERCENTAGE',
              executionSource: { databaseName: 'analytics', schemaName: 'public', tableName: 'orders' },
              customMetrics: [{ name: 'avg_age', value: 42 }],
            },
            columns: [
              {
                name: 'id',
                profile: {
                  valuesCount: 10,
                  nullCount: 1,
                  nullProportion: 0.1,
                  uniqueCount: 9,
                  uniqueProportion: 0.9,
                  distinctCount: 9,
                  distinctProportion: 0.9,
                  duplicateCount: 1,
                  nullMissingCount: 1,
                  countInSet: 3,
                  likeCount: 2,
                  iLikeCount: 2,
                  notLikeCount: 8,
                  regexCount: 1,
                  notRegexCount: 9,
                  likeRatio: 0.2,
                  iLikeRatio: 0.2,
                  min: 1,
                  max: 9,
                  minLength: 1,
                  maxLength: 1,
                  mean: 5,
                  sum: 45,
                  stddev: 2.5,
                  median: 5,
                  firstQuartile: 3,
                  thirdQuartile: 7,
                  interQuartileRange: 4,
                  nonParametricSkew: 0,
                  histogram: { boundaries: ['1-3', '3-9'], frequencies: [4, 6] },
                  cardinalityDistribution: { categories: ['a', 'Others'], counts: [8, 2], percentages: [80, 20] },
                  customMetrics: [{ name: 'max_id', value: 9 }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const profile = await getLatestTableProfile('svc.db.schema.orders');
    expect(profile.sizeInByte).toBe(16384);
    expect(profile.createDateTime).toBe('2026-01-02T03:04:05Z');
    expect(profile.profileSample).toBe(50);
    expect(profile.profileSampleType).toBe('PERCENTAGE');
    expect(profile.executionSource).toEqual({ databaseName: 'analytics', schemaName: 'public', tableName: 'orders' });
    expect(profile.customMetrics).toEqual([{ name: 'avg_age', value: 42 }]);
    const column = profile.columns[0];
    expect(column?.valuesCount).toBe(10);
    expect(column?.nullCount).toBe(1);
    expect(column?.nullProportion).toBe(0.1);
    expect(column?.uniqueCount).toBe(9);
    expect(column?.uniqueProportion).toBe(0.9);
    expect(column?.distinctCount).toBe(9);
    expect(column?.distinctProportion).toBe(0.9);
    expect(column?.duplicateCount).toBe(1);
    expect(column?.nullMissingCount).toBe(1);
    expect(column?.countInSet).toBe(3);
    expect(column?.likeCount).toBe(2);
    expect(column?.iLikeCount).toBe(2);
    expect(column?.notLikeCount).toBe(8);
    expect(column?.regexCount).toBe(1);
    expect(column?.notRegexCount).toBe(9);
    expect(column?.likeRatio).toBe(0.2);
    expect(column?.iLikeRatio).toBe(0.2);
    expect(column?.min).toBe('1');
    expect(column?.max).toBe('9');
    expect(column?.minLength).toBe(1);
    expect(column?.maxLength).toBe(1);
    expect(column?.mean).toBe('5');
    expect(column?.sum).toBe(45);
    expect(column?.stddev).toBe(2.5);
    expect(column?.median).toBe(5);
    expect(column?.firstQuartile).toBe(3);
    expect(column?.thirdQuartile).toBe(7);
    expect(column?.interQuartileRange).toBe(4);
    expect(column?.nonParametricSkew).toBe(0);
    expect(column?.histogram).toEqual({ boundaries: ['1-3', '3-9'], frequencies: [4, 6] });
    expect(column?.cardinalityDistribution).toEqual({
      categories: ['a', 'Others'],
      counts: [8, 2],
      percentages: [80, 20],
    });
    expect(column?.customMetrics).toEqual([{ name: 'max_id', value: 9 }]);
  });

  it('reads the table profiler config from GET /v1/tables/{id}/tableProfilerConfig', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ tableProfilerConfig: { sampleDataCount: 10, excludeColumns: ['secret'] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const config = await getTableProfilerConfig('tbl-1');
    expect(config).toEqual({ sampleDataCount: 10, excludeColumns: ['secret'] });
    expect(lastFetch().url).toContain('/api/v1/tables/tbl-1/tableProfilerConfig');
  });

  it('returns null when the table has no stored profiler config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ tableProfilerConfig: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(getTableProfilerConfig('tbl-1')).resolves.toBeNull();
  });

  it('writes the table profiler config with PUT /v1/tables/{id}/tableProfilerConfig', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    await putTableProfilerConfig('tbl-1', { sampleDataCount: 10 });
    const call = lastFetch();
    expect(call.url).toContain('/api/v1/tables/tbl-1/tableProfilerConfig');
    expect(call.init?.method).toBe('PUT');
    expect(call.init?.body).toBe(JSON.stringify({ sampleDataCount: 10 }));
  });
});
