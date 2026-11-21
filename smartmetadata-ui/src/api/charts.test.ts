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
import { fetchCharts, getChartById, updateChart } from './charts';

describe('charts API (D-2 batch 4: DashboardChartTable)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads one chart with fields=tags', async () => {
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        seenUrl = String(input);
        return new Response(
          JSON.stringify({
            id: 'c1',
            name: 'revenue',
            displayName: 'Revenue',
            fullyQualifiedName: 'svc.dash.revenue',
            chartType: 'Bar',
            description: 'Monthly revenue',
            tags: [{ tagFQN: 'Tier.Tier1', name: 'Tier1' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const chart = await getChartById('c1');
    expect(seenUrl).toContain('/api/v1/charts/c1');
    expect(seenUrl).toContain('fields=tags');
    expect(chart).toMatchObject({ id: 'c1', chartType: 'Bar', description: 'Monthly revenue' });
    expect(chart.tags).toHaveLength(1);
  });

  it('fetchCharts keeps only fulfilled charts (allSettled, pin behavior)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/charts/c1')) {
          return new Response(JSON.stringify({ id: 'c1', name: 'ok', fullyQualifiedName: 'svc.dash.ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ message: 'gone' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const charts = await fetchCharts([{ id: 'c1' }, { id: 'c2' }, {}]);
    expect(charts).toHaveLength(1);
    expect(charts[0].id).toBe('c1');
  });

  it('fetchCharts returns [] with no chart references', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchCharts([])).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('patches a chart and maps the updated row', async () => {
    let seenOptions: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        seenOptions = init;
        return new Response(
          JSON.stringify({ id: 'c1', name: 'revenue', description: 'New description', fullyQualifiedName: 'svc.dash.revenue' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const updated = await updateChart('c1', [{ op: 'replace', path: '/description', value: 'New description' }]);
    expect(seenOptions?.method).toBe('PATCH');
    expect((seenOptions?.headers as Record<string, string>)['Content-Type']).toBe('application/json-patch+json');
    expect(updated.description).toBe('New description');
  });
});
