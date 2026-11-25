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
import {
  ABSOLUTE_VALUE_CHART_NAMES,
  computeChangeInPercentagePoints,
  getQueryFilterForDataInsightChart,
  latestSummaryCount,
  listSystemChartData,
  mapSystemChartData,
  SERVICE_CHART_NAMES,
  SUMMARY_CARD_CHART_NAMES,
  SYSTEM_CHART_NAMES,
} from './dataInsights';
import { DATA_REPORT_INDEXES, getAggregateChartData } from './dataInsights';

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

  it('includes the two service charts, the summary cards and the absolute-value charts', () => {
    expect(SYSTEM_CHART_NAMES).toContain('percentage_of_service_with_description');
    expect(SYSTEM_CHART_NAMES).toContain('percentage_of_service_with_owner');
    expect(SERVICE_CHART_NAMES).toEqual([
      'percentage_of_service_with_description',
      'percentage_of_service_with_owner',
    ]);
    expect(SUMMARY_CARD_CHART_NAMES).toEqual([
      'total_data_assets_summary_card',
      'data_assets_with_description_summary_card',
      'data_assets_with_owner_summary_card',
      'total_data_assets_with_tier_summary_card',
    ]);
    expect(ABSOLUTE_VALUE_CHART_NAMES).toEqual([
      'number_of_data_asset_with_description_kpi',
      'number_of_data_asset_with_owner_kpi',
    ]);
  });

  it('builds the official team/tier query filter field for field', () => {
    expect(getQueryFilterForDataInsightChart()).toBeUndefined();
    expect(getQueryFilterForDataInsightChart([], [])).toBeUndefined();
    expect(JSON.parse(getQueryFilterForDataInsightChart(undefined, ['Tier.Gold']) as string)).toEqual({
      query: {
        bool: {
          must: [
            { bool: { should: [{ term: { 'tier.keyword': 'Tier.Gold' } }] } },
          ],
        },
      },
    });
    expect(JSON.parse(getQueryFilterForDataInsightChart(['Data Team']) as string)).toEqual({
      query: {
        bool: {
          must: [
            {
              nested: {
                path: 'owners',
                query: {
                  bool: { should: [{ term: { 'owners.name.keyword': 'Data Team' } }] },
                },
              },
            },
          ],
        },
      },
    });
    expect(JSON.parse(getQueryFilterForDataInsightChart(['Data Team'], ['Tier.Gold', 'Tier.Silver']) as string)).toEqual({
      query: {
        bool: {
          must: [
            {
              bool: {
                should: [
                  { term: { 'tier.keyword': 'Tier.Gold' } },
                  { term: { 'tier.keyword': 'Tier.Silver' } },
                ],
              },
            },
            {
              nested: {
                path: 'owners',
                query: {
                  bool: { should: [{ term: { 'owners.name.keyword': 'Data Team' } }] },
                },
              },
            },
          ],
        },
      },
    });
  });

  it('sends the filter with every chart request when one is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ total_data_assets: { results: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await listSystemChartData(['total_data_assets'], 100, 200, {
      filter: getQueryFilterForDataInsightChart(['Data Team'], ['Tier.Gold']),
    });
    const url = lastFetch();
    expect(url).toContain('filter=');
    const filter = new URL(url).searchParams.get('filter');
    expect(filter).not.toBeNull();
    expect(JSON.parse(filter as string)).toEqual(
      JSON.parse(getQueryFilterForDataInsightChart(['Data Team'], ['Tier.Gold']) as string),
    );
  });

  it('surfaces a 4xx to strict callers instead of the silent empty residual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no chart', { status: 404 })));
    await expect(
      listSystemChartData(['percentage_of_service_with_description'], 1, 2, { strict: true }),
    ).rejects.toThrow();
  });

  it('takes the headline from the greatest-day summary row, never the first row', () => {
    expect(
      latestSummaryCount([
        { count: 62.5, day: 7 },
        { count: 40, day: 1 },
        { count: 55, day: 3 },
      ]),
    ).toBe(62.5);
    expect(latestSummaryCount([])).toBeUndefined();
    expect(latestSummaryCount([{ day: 7 }, { count: 10, day: 2 }])).toBe(10);
  });

  it('computes the change in percentage points from hand-checked first/last days', () => {
    // First day: 100 + 100 = 200 total, 50 with description (25%).
    // Last day: 150 + 150 = 300 total, 120 with description (40%).
    // Change = 40 − 25 = 15 percentage points.
    expect(
      computeChangeInPercentagePoints(
        [
          { count: 100, day: 1, group: 'table' },
          { count: 150, day: 7, group: 'table' },
          { count: 100, day: 1, group: 'topic' },
          { count: 150, day: 7, group: 'topic' },
        ],
        [
          { count: 50, day: 1 },
          { count: 120, day: 7 },
        ],
      ),
    ).toBeCloseTo(15, 10);
  });

  it('aligns the absolute values to the totals first/last day, unordered rows included', () => {
    // Totals define the window (day 2 → day 5); the absolute series has no
    // day-2 row, so the first-day absolute counts as 0: (90/300 − 0) × 100 = 30.
    expect(
      computeChangeInPercentagePoints(
        [
          { count: 300, day: 5, group: 'table' },
          { count: 100, day: 2, group: 'table' },
          { count: 200, day: 2, group: 'topic' },
        ],
        [{ count: 90, day: 5 }],
      ),
    ).toBeCloseTo(30, 10);
    expect(computeChangeInPercentagePoints([], [{ count: 5, day: 1 }])).toBe(0);
    expect(
      computeChangeInPercentagePoints(
        [{ count: 0, day: 1, group: 'table' }],
        [{ count: 0, day: 1 }],
      ),
    ).toBe(0);
  });

  it('calls GET /v1/analytics/dataInsights/charts/aggregate with chart name and index', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                chartType: 'MostActiveUsers',
                total: 1,
                data: [{ userName: 'alice', sessions: 5, pageViews: 9 }],
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const results = await getAggregateChartData({
      dataInsightChartName: 'MostActiveUsers',
      dataReportIndex: DATA_REPORT_INDEXES.webAnalyticUserActivity,
      startTs: 10,
      endTs: 20,
    });
    expect(lastFetch()).toContain('/api/v1/analytics/dataInsights/charts/aggregate');
    expect(lastFetch()).toContain('dataInsightChartName=MostActiveUsers');
    expect(lastFetch()).toContain(`dataReportIndex=${DATA_REPORT_INDEXES.webAnalyticUserActivity}`);
    expect(lastFetch()).toContain('startTs=10');
    expect(results[0]?.data[0]).toMatchObject({ userName: 'alice', sessions: 5 });
  });
});
