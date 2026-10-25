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
import { listSystemChartData, mapSystemChartData, SYSTEM_CHART_NAMES } from './dataInsights';

function lastFetch(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

describe('data insights API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('maps listChartData results and drops empty charts', () => {
    expect(
      mapSystemChartData({
        total_data_assets: {
          results: [{ count: 3, day: 10, group: 'table' }],
        },
        total_data_assets_by_tier: { results: [] },
      }),
    ).toEqual({
      total_data_assets: [{ count: 3, day: 10, group: 'table', term: undefined, metric: undefined }],
    });
  });

  it('calls GET /v1/analytics/dataInsights/system/charts/listChartData', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            total_data_assets: { results: [{ count: 2, day: 1, group: 'table' }] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const data = await listSystemChartData(SYSTEM_CHART_NAMES, 100, 200);
    expect(data.total_data_assets?.[0]?.count).toBe(2);
    const url = decodeURIComponent(lastFetch());
    expect(url).toContain('/api/v1/analytics/dataInsights/system/charts/listChartData');
    expect(url).toContain('chartNames=total_data_assets');
    expect(url).toContain('start=100');
    expect(url).toContain('end=200');
  });

  it('treats 404 as residual empty instead of fake points', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no pipeline', { status: 404 })));
    await expect(listSystemChartData(['total_data_assets'], 1, 2)).resolves.toEqual({});
  });
});
