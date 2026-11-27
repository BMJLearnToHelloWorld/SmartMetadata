import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { listTableCustomMetricNames, putCustomMetric } from './customMetrics';

function lastFetch(): { url: string; init?: RequestInit } {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('customMetrics API (official customMetricAPI)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'tbl-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('PUTs official table-level name and expression without a columnName', async () => {
    await putCustomMetric('tbl-1', { name: 'row_ratio', expression: 'SELECT 1' });
    const call = lastFetch();
    expect(call.url).toContain('/api/v1/tables/tbl-1/customMetric');
    expect(call.init?.method).toBe('PUT');
    expect(JSON.parse(String(call.init?.body ?? '{}'))).toEqual({ name: 'row_ratio', expression: 'SELECT 1' });
  });

  it('includes official columnName only for column metrics', async () => {
    await putCustomMetric('tbl-1', { name: 'nulls', expression: 'SELECT 1', columnName: 'id' });
    expect(JSON.parse(String(lastFetch().init?.body ?? '{}'))).toEqual({
      name: 'nulls',
      expression: 'SELECT 1',
      columnName: 'id',
    });
  });

  it('lists existing table customMetrics names for official uniqueness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://local.test');
        expect(url.pathname).toBe('/api/v1/tables/tbl-1');
        expect(url.searchParams.get('fields')).toBe('customMetrics');
        return new Response(JSON.stringify({ id: 'tbl-1', customMetrics: [{ name: 'row_ratio' }, { name: 'dup' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await expect(listTableCustomMetricNames('tbl-1')).resolves.toEqual(['row_ratio', 'dup']);
  });
});
