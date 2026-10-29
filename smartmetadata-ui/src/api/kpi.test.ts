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
  createKpi,
  deleteKpi,
  deleteKpiByName,
  getKpiById,
  getKpiByName,
  getLatestKpiResult,
  KPI_FIELDS,
  listKpiResults,
  listKpis,
  mapKpi,
  mapKpiResultPoints,
  patchKpi,
  patchKpiByName,
  updateKpi,
} from './kpi';

function lastFetch(): { url: string; init?: RequestInit } {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] as RequestInit | undefined };
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

const createBody = {
  name: 'description-coverage',
  description: 'Share of assets with a description',
  dataInsightChart: 'percentage_of_data_asset_with_description_kpi',
  startDate: 1704067200000,
  endDate: 1735689600000,
  targetValue: 80,
  metricType: 'PERCENTAGE',
  displayName: 'Description coverage',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [sampleKpi], paging: { total: 1 } })));
    const page = await listKpis({ limit: 50 });
    expect(page.data[0]?.name).toBe('description-coverage');
    expect(page.data[0]?.targetValue).toBe(80);
    expect(page.total).toBe(1);
    const url = decodeURIComponent(lastFetch().url);
    expect(url).toContain('/api/v1/kpi');
    expect(url).toContain(`fields=${KPI_FIELDS}`);
    expect(url).toContain('limit=50');
  });

  it('returns an empty page when GET /v1/kpi has no data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [] })));
    await expect(listKpis()).resolves.toEqual({ data: [], after: undefined, before: undefined, total: undefined });
  });

  it('gets one KPI from GET /v1/kpi/name/{name}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(sampleKpi)));
    const kpi = await getKpiByName('description-coverage');
    expect(kpi.kpiResult?.targetResult[0]?.value).toBe('42');
    expect(decodeURIComponent(lastFetch().url)).toContain('/api/v1/kpi/name/description-coverage');
  });

  it('gets one KPI from GET /v1/kpi/{id}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(sampleKpi)));
    const kpi = await getKpiById('k1');
    expect(kpi.id).toBe('k1');
    expect(decodeURIComponent(lastFetch().url)).toContain('/api/v1/kpi/k1');
  });

  it('creates a KPI with POST /v1/kpi', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(sampleKpi, 201));
    vi.stubGlobal('fetch', fetchMock);
    const created = await createKpi(createBody);
    expect(created.name).toBe('description-coverage');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/kpi');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: 'description-coverage',
      dataInsightChart: 'percentage_of_data_asset_with_description_kpi',
      targetValue: 80,
      metricType: 'PERCENTAGE',
    });
  });

  it('updates a KPI with PUT /v1/kpi createOrUpdate', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(sampleKpi));
    vi.stubGlobal('fetch', fetchMock);
    await updateKpi({ ...createBody, targetValue: 90 });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body)).targetValue).toBe(90);
  });

  it('patches a KPI by id with RFC 6902 json-patch', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(sampleKpi));
    vi.stubGlobal('fetch', fetchMock);
    await patchKpi('k1', [{ op: 'replace', path: '/targetValue', value: 85 }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/kpi/k1');
    expect(init?.method).toBe('PATCH');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json-patch+json');
    expect(JSON.parse(String(init?.body))).toEqual([{ op: 'replace', path: '/targetValue', value: 85 }]);
  });

  it('patches a KPI by name with RFC 6902 json-patch', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(sampleKpi));
    vi.stubGlobal('fetch', fetchMock);
    await patchKpiByName('description-coverage', [{ op: 'replace', path: '/description', value: 'updated' }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(decodeURIComponent(String(url))).toContain('/api/v1/kpi/name/description-coverage');
    expect(init?.method).toBe('PATCH');
  });

  it('deletes a KPI by id with optional hardDelete', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteKpi('k1', { hardDelete: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/kpi/k1');
    expect(String(url)).toContain('hardDelete=true');
    expect(init?.method).toBe('DELETE');
  });

  it('deletes a KPI by name', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteKpiByName('description-coverage', { hardDelete: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(decodeURIComponent(String(url))).toContain('/api/v1/kpi/name/description-coverage');
    expect(init?.method).toBe('DELETE');
  });

  it('lists KPI results from GET /v1/kpi/{name}/kpiResult without inventing points', async () => {
    expect(mapKpiResultPoints({ results: [] })).toEqual([]);
    expect(mapKpiResultPoints({})).toEqual([]);
    const fetchMock = vi.fn(
      async () =>
        jsonResponse({
          results: [
            { day: 1704067200000, count: 42, group: 'completedDescriptionFraction' },
            { displayName: 'orphan' },
          ],
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const points = await listKpiResults('description-coverage', {
      startTs: 1704067200000,
      endTs: 1735689600000,
      orderBy: 'ASC',
    });
    expect(points).toEqual([{ day: 1704067200000, count: 42, group: 'completedDescriptionFraction' }]);
    const url = decodeURIComponent(String(fetchMock.mock.calls[0]![0]));
    expect(url).toContain('/api/v1/kpi/description-coverage/kpiResult');
    expect(url).toContain('startTs=1704067200000');
    expect(url).toContain('endTs=1735689600000');
    expect(url).toContain('orderBy=ASC');
  });

  it('gets latest KPI result from GET /v1/kpi/{name}/latestKpiResult', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          jsonResponse({
            timestamp: 1704153600000,
            kpiFqn: 'description-coverage',
            targetResult: [{ name: 'completedDescriptionFraction', value: '42', targetMet: false }],
          }),
      ),
    );
    const result = await getLatestKpiResult('description-coverage');
    expect(result?.targetResult[0]?.value).toBe('42');
    expect(decodeURIComponent(lastFetch().url)).toContain('/api/v1/kpi/description-coverage/latestKpiResult');
  });
});
