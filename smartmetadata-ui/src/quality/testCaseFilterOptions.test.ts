import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_CASE_FILTER_OPTION_PAGE_SIZE,
  TEST_CASE_FILTER_SEARCH_INDEX,
  CERTIFICATION_CATEGORY,
  TAG_FILTER_PAGE_SIZE,
  TAG_FILTER_QUERY_FILTER,
  TIER_CATEGORY,
  DIMENSION_FILTER_PAGE_SIZE,
  fetchDataProductFilterOptions,
  fetchDimensionFilterOptions,
  fetchServiceFilterOptions,
  fetchTableFilterOptions,
  fetchTagFilterOptions,
  fetchTierFilterOptions,
  filterSearchQuery,
  mapSearchHitOption,
  tagFilterSearchQuery,
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
    expect(TEST_CASE_FILTER_SEARCH_INDEX.tag).toBe('tag');
    expect(TAG_FILTER_PAGE_SIZE).toBe(10);
    expect(TIER_CATEGORY).toBe('Tier');
    expect(CERTIFICATION_CATEGORY).toBe('Certification');
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
    await expect(fetchTagFilterOptions('x')).resolves.toEqual([]);
  });

  it('wraps official tag search as *term* and ** for an empty term', () => {
    expect(tagFilterSearchQuery('')).toBe('**');
    expect(tagFilterSearchQuery('pii')).toBe('*pii*');
    expect(tagFilterSearchQuery('a:b')).toBe('*a\\:b*');
  });

  it('searches tags through official index, page size, query_filter, and excludes Tier', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://local.test');
      expect(url.pathname).toBe('/api/v1/search/query');
      expect(url.searchParams.get('index')).toBe('tag');
      expect(url.searchParams.get('size')).toBe('10');
      expect(url.searchParams.get('q')).toBe('*pii*');
      const filter = JSON.parse(String(url.searchParams.get('query_filter')));
      expect(filter).toEqual(JSON.parse(TAG_FILTER_QUERY_FILTER));
      return jsonResponse({
        hits: {
          total: { value: 3 },
          hits: [
            { _source: { name: 'Sensitive', fullyQualifiedName: 'PII.Sensitive' } },
            { _source: { name: 'Tier1', fullyQualifiedName: 'Tier.Tier1', classification: { name: 'Tier' } } },
            { _source: { name: 'Gold', fullyQualifiedName: 'Certification.Gold' } },
          ],
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const options = await fetchTagFilterOptions('pii');
    expect(options).toEqual([{ value: 'PII.Sensitive', label: 'PII.Sensitive' }]);
  });

  it('uses official AGGREGATE_PAGE_SIZE_LARGE for dimensions', () => {
    expect(DIMENSION_FILTER_PAGE_SIZE).toBe(1000);
  });

  it('loads dimension options from GET /dataQuality/dimensions with NoDimension first', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://local.test');
      expect(url.pathname).toBe('/api/v1/dataQuality/dimensions');
      expect(url.searchParams.get('limit')).toBe('1000');
      return jsonResponse({
        data: [
          { id: 'd1', name: 'Accuracy', displayName: 'Accuracy' },
          { id: 'd2', name: 'Integrity', displayName: '完整性' },
        ],
        paging: { total: 2 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const options = await fetchDimensionFilterOptions('无维度');
    expect(options[0]).toEqual({ value: 'NoDimension', label: '无维度' });
    expect(options.slice(1)).toEqual([
      { value: 'Accuracy', label: 'Accuracy' },
      { value: 'Integrity', label: '完整性' },
    ]);
  });

  it('falls back to the shipped dimension enum when the dimensions API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const options = await fetchDimensionFilterOptions('No Dimension');
    expect(options[0]).toEqual({ value: 'NoDimension', label: 'No Dimension' });
    expect(options.map((option) => option.value)).toEqual([
      'NoDimension',
      'Accuracy',
      'Completeness',
      'Consistency',
      'Integrity',
      'SQL',
      'Uniqueness',
      'Validity',
    ]);
  });
});
