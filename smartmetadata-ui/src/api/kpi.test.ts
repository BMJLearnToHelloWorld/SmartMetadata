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
import { getKpiByName, KPI_FIELDS, listKpis, mapKpi } from './kpi';

function lastFetch(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

const sampleKpi = {
  id: 'k1',
  name: 'description-coverage',
  displayName: 'Description coverage',
  description: 'Share of assets with a description',
  metricType: 'PERCENTAGE',
  targetValue: 80,
  startDate: 1704067200000,
  endDate: 1735689600000,
  dataInsightChart: { name: 'percentage_of_data_asset_with_description', type: 'dataInsightCustomChart' },
  owners: [{ name: 'admin', type: 'user' }],
  kpiResult: {
    timestamp: 1704153600000,
    kpiFqn: 'description-coverage',
    targetResult: [{ name: 'completedDescriptionFraction', value: '42', targetMet: false }],
  },
};

describe('kpi API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('maps a KPI row and keeps catalog target/result values as-is', () => {
    const mapped = mapKpi(sampleKpi);
    expect(mapped).toEqual({
      id: 'k1',
      name: 'description-coverage',
      displayName: 'Description coverage',
      fullyQualifiedName: 'description-coverage',
      description: 'Share of assets with a description',
      metricType: 'PERCENTAGE',
      targetValue: 80,
      startDate: 1704067200000,
      endDate: 1735689600000,
      dataInsightChart: {
        name: 'percentage_of_data_asset_with_description',
        type: 'dataInsightCustomChart',
        displayName: undefined,
        id: undefined,
        fullyQualifiedName: undefined,
      },
      owners: [{ name: 'admin', type: 'user', displayName: undefined, id: undefined, fullyQualifiedName: undefined }],
      kpiResult: {
        timestamp: 1704153600000,
        kpiFqn: 'description-coverage',
        targetResult: [{ name: 'completedDescriptionFraction', value: '42', targetMet: false }],
      },
    });
  });

  it('drops rows without a name and does not invent a targetValue', () => {
    expect(mapKpi({ displayName: 'orphan', targetValue: 99 })).toBeNull();
    expect(mapKpi({ name: 'bare' })).toMatchObject({ name: 'bare', targetValue: undefined, kpiResult: undefined });
  });

  it('lists KPIs from GET /v1/kpi with default fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [sampleKpi], paging: { total: 1 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const page = await listKpis({ limit: 50 });
    expect(page.data[0]?.name).toBe('description-coverage');
    expect(page.data[0]?.targetValue).toBe(80);
    expect(page.total).toBe(1);
    const url = decodeURIComponent(lastFetch());
    expect(url).toContain('/api/v1/kpi');
    expect(url).toContain(`fields=${KPI_FIELDS}`);
    expect(url).toContain('limit=50');
  });

  it('returns an empty page when GET /v1/kpi has no data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await expect(listKpis()).resolves.toEqual({ data: [], after: undefined, before: undefined, total: undefined });
  });

  it('gets one KPI from GET /v1/kpi/name/{name}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(sampleKpi), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const kpi = await getKpiByName('description-coverage');
    expect(kpi.kpiResult?.targetResult[0]?.value).toBe('42');
    expect(decodeURIComponent(lastFetch())).toContain('/api/v1/kpi/name/description-coverage');
  });
});
