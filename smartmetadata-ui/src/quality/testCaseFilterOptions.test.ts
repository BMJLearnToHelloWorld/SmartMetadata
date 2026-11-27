import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_CASE_FILTER_OPTION_PAGE_SIZE,
  TEST_CASE_FILTER_SEARCH_INDEX,
  fetchDataProductFilterOptions,
  fetchServiceFilterOptions,
  fetchTableFilterOptions,
  fetchTierFilterOptions,
  filterSearchQuery,
  mapSearchHitOption,
} from './testCaseFilterOptions';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

describe('testCaseFilterOptions (official useTestCaseFilterOptions)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses official PAGE_SIZE_BASE and official search indexes', () => {
    expect(TEST_CASE_FILTER_OPTION_PAGE_SIZE).toBe(15);
    expect(TEST_CASE_FILTER_SEARCH_INDEX.table).toBe('table');
    expect(TEST_CASE_FILTER_SEARCH_INDEX.service).toBe('databaseService');
    expect(TEST_CASE_FILTER_SEARCH_INDEX.dataProduct).toBe('dataProduct');
  });

  it('wraps a typed term in official *term* wildcards and keeps * for an empty term', () => {
    expect(filterSearchQuery('')).toBe('*');
    expect(filterSearchQuery('  *  ')).toBe('*');
    expect(filterSearchQuery('orders')).toBe('*orders*');
  });

  it('maps table and data-product hits to fullyQualifiedName and services to name', () => {
    const hit = {
      name: 'orders',
      displayName: 'Orders',
      fullyQualifiedName: 'svc.db.schema.orders',
    };
    expect(mapSearchHitOption(hit, 'fullyQualifiedName')).toEqual({
      value: 'svc.db.schema.orders',
      label: 'Orders',
      subLabel: 'svc.db.schema.orders',
    });
    expect(mapSearchHitOption(hit, 'name')).toEqual({
      value: 'orders',
      label: 'Orders',
      subLabel: 'svc.db.schema.orders',
    });
  });

  it('searches tables, services and data products through GET /v1/search/query', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://local.test');
      expect(url.pathname).toBe('/api/v1/search/query');
      expect(url.searchParams.get('size')).toBe('15');
      expect(url.searchParams.get('q')).toBe('*ord*');
      const index = url.searchParams.get('index');
      const name = index === 'databaseService' ? 'warehouse' : 'orders';
      const fqn = index === 'databaseService' ? 'warehouse' : 'svc.db.schema.orders';
      return jsonResponse({
        hits: {
          total: { value: 1 },
          hits: [{ _source: { name, displayName: name, fullyQualifiedName: fqn } }],
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const tables = await fetchTableFilterOptions('ord');
    expect(tables[0]?.value).toBe('svc.db.schema.orders');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('index=table');

    const services = await fetchServiceFilterOptions('ord');
    expect(services[0]?.value).toBe('warehouse');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('index=databaseService');

    const products = await fetchDataProductFilterOptions('ord');
    expect(products[0]?.value).toBe('svc.db.schema.orders');
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('index=dataProduct');
  });

  it('loads tiers from GET /v1/tags?parent=Tier and uses the tag FQN as the value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://local.test');
        expect(url.pathname).toBe('/api/v1/tags');
        expect(url.searchParams.get('parent')).toBe('Tier');
        return jsonResponse({
          data: [{ id: 't1', name: 'Tier1', displayName: 'Tier 1', fullyQualifiedName: 'Tier.Tier1' }],
        });
      }),
    );
    const options = await fetchTierFilterOptions();
    expect(options).toEqual([{ value: 'Tier.Tier1', label: 'Tier 1', subLabel: 'Tier.Tier1' }]);
  });

  it('returns an empty list when a search or tag request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(fetchTableFilterOptions('x')).resolves.toEqual([]);
    await expect(fetchTierFilterOptions()).resolves.toEqual([]);
  });
});
