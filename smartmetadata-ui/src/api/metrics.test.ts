/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addAssetsToMetric,
  buildMetricStatusQueryFilter,
  createMetric,
  deleteMetricAsync,
  exportMetricsCsvAsync,
  fetchMetricLinkedAssetIds,
  getCustomUnitsOfMeasurement,
  getMetricAncestorFqns,
  getMetricAssets,
  getMetricGroupMetrics,
  getMetricHierarchy,
  getMetricHierarchyContext,
  getMetricObservability,
  getMetricParentIds,
  getMetricSearchPaths,
  listMetrics,
  mapMetricHierarchyItem,
  METRIC_STATUS_VALUES,
  patchMetric,
  removeAssetsFromMetric,
} from './metrics';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastUrl(): URL {
  return new URL(String(vi.mocked(fetch).mock.calls.at(-1)?.[0]));
}

describe('listMetrics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps metric entities and drops rows missing id, name, or FQN', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(String(url)).toContain('/api/v1/metrics');
      return jsonResponse({
        data: [
          {
            id: 'm1',
            name: 'mau',
            fullyQualifiedName: 'kpi.mau',
            owners: [{ id: 'u1', name: 'alice', type: 'user' }],
            tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }],
          },
          { name: 'nameless' },
        ],
        paging: { after: 'next-cursor' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = await listMetrics({ limit: 1000 });
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({
      id: 'm1',
      name: 'mau',
      fullyQualifiedName: 'kpi.mau',
    });
    expect(page.data[0]?.owners).toEqual([{ id: 'u1', name: 'alice', type: 'user' }]);
    expect(page.after).toBe('next-cursor');
  });

  it('passes parent and entityStatus through and requests childrenCount', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'm2',
              name: 'mau-eu',
              fullyQualifiedName: 'kpi.mau.eu',
              parent: { id: 'm1', name: 'mau', fullyQualifiedName: 'kpi.mau', type: 'metric' },
              childrenCount: 0,
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listMetrics({ parent: 'kpi.mau', entityStatus: 'Approved', limit: 50 });
    const url = lastUrl();
    expect(url.searchParams.get('parent')).toBe('kpi.mau');
    expect(url.searchParams.get('entityStatus')).toBe('Approved');
    expect(url.searchParams.get('fields')).toContain('childrenCount');
    expect(page.data[0]).toMatchObject({ childrenCount: 0 });
    expect(page.data[0]?.parent).toMatchObject({ fullyQualifiedName: 'kpi.mau' });
  });

  it('omits parent and entityStatus when neither is given', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [], paging: {} })));
    await listMetrics({ limit: 10 });
    const url = lastUrl();
    expect(url.searchParams.has('parent')).toBe(false);
    expect(url.searchParams.has('entityStatus')).toBe(false);
  });
});

describe('deleteMetricAsync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to recursive=true (A-D5; the official function defaults to false)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ jobId: 'j1' })));
    await deleteMetricAsync('m1');
    const url = lastUrl();
    expect(url.pathname).toContain('/api/v1/metrics/async/m1');
    expect(url.searchParams.get('recursive')).toBe('true');
  });

  it('sends recursive=false when the caller explicitly asks for it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ jobId: 'j1' })));
    await deleteMetricAsync('m1', false);
    expect(lastUrl().searchParams.get('recursive')).toBe('false');
  });
});

describe('patchMetric (official rest/metricsAPI.ts)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCHes /v1/metrics/{id} as a JSON Patch document', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'm1', name: 'mau' }));
    vi.stubGlobal('fetch', fetchMock);
    await patchMetric('m1', [{ op: 'replace', path: '/description', value: 'New copy' }]);
    // csvImport.test.ts pattern: the stubbed global fetch carries the
    // real fetch signature, so the call destructure type-checks.
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/metrics/m1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual([
      { op: 'replace', path: '/description', value: 'New copy' },
    ]);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toContain('application/json-patch+json');
  });
});

describe('buildMetricStatusQueryFilter', () => {
  it.each(METRIC_STATUS_VALUES)(
    'emits the official EntityStatus value %s as the term value',
    (status) => {
      const parsed = JSON.parse(buildMetricStatusQueryFilter(status)) as {
        query: { bool: { must: Array<{ term: Record<string, string> }> } };
      };
      expect(parsed.query.bool.must).toEqual([{ term: { entityStatus: status } }]);
    },
  );

  it('uses "In Review" with a space, never "InReview"', () => {
    expect(buildMetricStatusQueryFilter('In Review')).toContain('In Review');
    expect(buildMetricStatusQueryFilter('In Review')).not.toContain('InReview');
  });
});

describe('getMetricHierarchy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists hierarchy items with limit/offset/q and maps groups and metrics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              kind: 'metricGroup',
              group: {
                id: 'g1',
                name: 'profitability',
                fullyQualifiedName: 'profitability',
                metricCount: 2,
              },
            },
            {
              kind: 'metric',
              metric: {
                id: 'm1',
                name: 'mau',
                fullyQualifiedName: 'kpi.mau',
                childrenCount: 2,
              },
            },
          ],
          paging: { total: 2 },
        }),
      ),
    );
    const page = await getMetricHierarchy({ limit: 15, offset: 0, q: 'mau' });
    const url = lastUrl();
    expect(url.pathname).toContain('/api/v1/metrics/hierarchy');
    expect(url.searchParams.get('limit')).toBe('15');
    expect(url.searchParams.get('offset')).toBe('0');
    expect(url.searchParams.get('q')).toBe('mau');
    expect(page.data[0]).toMatchObject({
      kind: 'metricGroup',
      group: { id: 'g1', metricCount: 2 },
    });
    expect(page.data[1]).toMatchObject({ kind: 'metric', metric: { childrenCount: 2 } });
  });

  it('throws on an unknown hierarchy kind instead of silently dropping the row', () => {
    expect(() => mapMetricHierarchyItem({ kind: 'metricUniverse', metric: {} })).toThrow(
      /Invalid metric hierarchy item/,
    );
    expect(() => mapMetricHierarchyItem({ kind: 'metric' })).toThrow(/missing its metric/);
    expect(() => mapMetricHierarchyItem({ kind: 'metricGroup' })).toThrow(/missing its group/);
  });
});

describe('getMetricHierarchyContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads one metric hierarchy context with child/sibling paging totals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          current: { id: 'm2', name: 'dau', fullyQualifiedName: 'kpi.dau' },
          ancestors: [{ id: 'm1', name: 'mau', fullyQualifiedName: 'kpi.mau' }],
          children: [{ id: 'm3', name: 'dau-ios', fullyQualifiedName: 'kpi.dau-ios' }],
          childrenPaging: { total: 3 },
          siblings: [{ id: 'm4', name: 'wau', fullyQualifiedName: 'kpi.wau' }],
          siblingPaging: { total: 1 },
        }),
      ),
    );
    const context = await getMetricHierarchyContext('m2', {
      childLimit: 25,
      childOffset: 0,
      siblingLimit: 25,
      siblingOffset: 0,
    });
    const url = lastUrl();
    expect(url.pathname).toContain('/api/v1/metrics/m2/hierarchy');
    expect(url.searchParams.get('childLimit')).toBe('25');
    expect(url.searchParams.get('siblingLimit')).toBe('25');
    expect(context.current.id).toBe('m2');
    expect(context.ancestors.map((metric) => metric.id)).toEqual(['m1']);
    expect(context.childrenTotal).toBe(3);
    expect(context.siblingTotal).toBe(1);
  });

  it('throws when the context response has no current metric', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ children: [] })));
    await expect(getMetricHierarchyContext('m2')).rejects.toThrow(/missing its current metric/);
  });
});

describe('getMetricGroupMetrics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the group endpoint with rootOnly=true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ id: 'm1', name: 'mau', fullyQualifiedName: 'kpi.mau' }],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await getMetricGroupMetrics('g1', { limit: 15, offset: 0, rootOnly: true });
    const url = lastUrl();
    expect(url.pathname).toContain('/api/v1/metricGroups/g1/metrics');
    expect(url.searchParams.get('rootOnly')).toBe('true');
    expect(page.data).toHaveLength(1);
  });
});

describe('createMetric', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the payload to /v1/metrics and maps the created metric', async () => {
    let seenInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seenInit = init;
        return jsonResponse({ id: 'm9', name: 'mau', fullyQualifiedName: 'kpi.mau' });
      }),
    );
    const created = await createMetric({ name: 'mau', parent: 'kpi.mau-parent' });
    expect(seenInit?.method).toBe('POST');
    expect(JSON.parse(String(seenInit?.body))).toMatchObject({
      name: 'mau',
      parent: 'kpi.mau-parent',
    });
    expect(created).toMatchObject({ id: 'm9', fullyQualifiedName: 'kpi.mau' });
  });
});

describe('exportMetricsCsvAsync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the async export endpoint and dispatches the CSV jobs refresh event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ jobId: 'job-1' })),
    );
    const seen: Event[] = [];
    const listener = (event: Event): void => {
      seen.push(event);
    };
    window.addEventListener('csv-jobs-refresh', listener);
    try {
      const payload = await exportMetricsCsvAsync('*');
      expect(payload).toMatchObject({ jobId: 'job-1' });
      expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
        '/api/v1/metrics/name/*/exportAsync',
      );
      expect(seen).toHaveLength(1);
    } finally {
      window.removeEventListener('csv-jobs-refresh', listener);
    }
  });

  it('returns an empty job record when the server response carries no jobId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ status: 'QUEUED' })));
    try {
      const payload = await exportMetricsCsvAsync('*');
      expect(payload).toEqual({});
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('getCustomUnitsOfMeasurement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the string list from /v1/metrics/customUnits', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(['sessions', 'users'])));
    await expect(getCustomUnitsOfMeasurement()).resolves.toEqual(['sessions', 'users']);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('/api/v1/metrics/customUnits');
  });
});

describe('getMetricObservability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the health rollup and falls back to Unknown for an unrecognized band', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ health: 'Healthy', score: 92, evaluatedAssetCount: 3 }),
      ),
    );
    await expect(getMetricObservability('m1')).resolves.toMatchObject({
      health: 'Healthy',
      score: 92,
      evaluatedAssetCount: 3,
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ health: 'Weird' })));
    await expect(getMetricObservability('m1')).resolves.toMatchObject({ health: 'Unknown' });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      '/api/v1/metrics/m1/observability',
    );
  });
});

describe('getMetricSearchPaths', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('walks parent ids up to the root and reports complete when the walk finishes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const filter = url.searchParams.get('query_filter');
        if (filter) {
          const parsed = JSON.parse(filter) as {
            query: { bool: { should: Array<{ term: Record<string, string> }> } };
          };
          const wanted = parsed.query.bool.should.map((term) => term.term['id.keyword']);
          // The parent lookup returns the parents themselves, each with
          // their own parent link, until the root (no parent).
          const docs = wanted.flatMap((id) => {
            if (id === 'm-child') {
              return [{ _source: { id: 'm-child', parent: { id: 'm-parent' } } }];
            }
            if (id === 'm-parent') {
              return [{ _source: { id: 'm-parent' } }];
            }
            return [];
          });
          return jsonResponse({ hits: { total: { value: docs.length }, hits: docs } });
        }
        return jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [{ _source: { id: 'm-child', parent: { id: 'm-parent' } } }],
          },
        });
      }),
    );
    const paths = await getMetricSearchPaths('eu');
    expect(paths.matchIds).toEqual(new Set(['m-child']));
    expect(paths.ancestorIds).toEqual(new Set(['m-parent']));
    expect(paths.complete).toBe(true);
    const firstUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(firstUrl.searchParams.get('q')).toBe('eu');
  });
});

describe('getMetricParentIds', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps each id to its direct parent id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [{ _source: { id: 'm-child', parent: { id: 'm-parent' } } }],
          },
        }),
      ),
    );
    const map = await getMetricParentIds(['m-child']);
    expect(map.get('m-child')).toBe('m-parent');
  });
});

describe('getMetricAncestorFqns', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('walks parent FQNs root-first through the metric name endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/api/v1/metrics/name/kpi.mau.eu')) {
          return jsonResponse({
            id: 'm-child',
            name: 'mau-eu',
            fullyQualifiedName: 'kpi.mau.eu',
            parent: { id: 'm1', name: 'mau', fullyQualifiedName: 'kpi.mau', type: 'metric' },
          });
        }
        if (url.includes('/api/v1/metrics/name/kpi.mau')) {
          return jsonResponse({ id: 'm1', name: 'mau', fullyQualifiedName: 'kpi.mau' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    await expect(getMetricAncestorFqns('kpi.mau.eu')).resolves.toEqual(['kpi.mau']);
  });

  it('returns the partial chain instead of throwing when a hop fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );
    await expect(getMetricAncestorFqns('kpi.missing')).resolves.toEqual([]);
  });
});

describe('getMetricAssets (B2-G1; official rest/metricsAPI.ts:259)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs /v1/metrics/{id}/assets with the pin params and maps directions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              asset: { id: 't1', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders', type: 'table' },
              direction: 'upstream',
              affectsHealth: true,
            },
            {
              asset: { id: 'd1', name: 'sales', fullyQualifiedName: 'svc.sales', type: 'dashboard' },
              direction: 'downstream',
            },
            { direction: 'unrelated' },
          ],
          paging: { total: 3 },
        }),
      ),
    );
    const page = await getMetricAssets('m1', { limit: 20, offset: 0, q: 'ord', entityType: 'table', direction: 'upstream' });
    const url = lastUrl();
    expect(url.pathname).toContain('/api/v1/metrics/m1/assets');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('offset')).toBe('0');
    expect(url.searchParams.get('q')).toBe('ord');
    expect(url.searchParams.get('entityType')).toBe('table');
    expect(url.searchParams.get('direction')).toBe('upstream');
    expect(page.total).toBe(3);
    // The row without an asset is dropped: direction is meaningless without one.
    expect(page.data).toHaveLength(2);
    expect(page.data[0]).toMatchObject({
      asset: expect.objectContaining({ id: 't1', type: 'table' }),
      direction: 'upstream',
      affectsHealth: true,
    });
    expect(page.data[1]).toMatchObject({ direction: 'downstream', affectsHealth: undefined });
  });

  it('defaults an unrecognized direction to unrelated (schema default)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              asset: { id: 't1', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders', type: 'table' },
              direction: 'sideways',
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await getMetricAssets('m1');
    expect(page.data[0]?.direction).toBe('unrelated');
  });
});

describe('fetchMetricLinkedAssetIds (pin useMetricLinkedAssets.ts)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pages at the 1000 cap and returns every linked id', async () => {
    const seenOffsets: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        seenOffsets.push(url.searchParams.get('offset') ?? '');
        const offset = Number(url.searchParams.get('offset') ?? 0);
        return jsonResponse({
          data:
            offset === 0
              ? [
                  { asset: { id: 'a1', type: 'table' }, direction: 'upstream' },
                  { asset: { id: 'a2', type: 'table' }, direction: 'downstream' },
                ]
              : [{ asset: { id: 'a3', type: 'dashboard' }, direction: 'unrelated' }],
          paging: { total: 1001 },
        });
      }),
    );
    await expect(fetchMetricLinkedAssetIds('m1')).resolves.toEqual(['a1', 'a2', 'a3']);
    expect(seenOffsets).toEqual(['0', '1000']);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('limit=1000');
  });

  it('makes a single call when the total fits on one page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ asset: { id: 'a1', type: 'table' }, direction: 'upstream' }],
          paging: { total: 1 },
        }),
      ),
    );
    await expect(fetchMetricLinkedAssetIds('m1')).resolves.toEqual(['a1']);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });
});

describe('addAssetsToMetric / removeAssetsFromMetric (official rest/metricsAPI.ts:227-249)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUTs {assets} to /v1/metrics/{fqn}/assets/add by FQN', async () => {
    let seenInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seenInit = init;
        return jsonResponse({ status: 'SUCCESS', numberOfRowsPassed: 1 });
      }),
    );
    const result = await addAssetsToMetric('kpi.mau', [
      { id: 't1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' },
    ]);
    expect(seenInit?.method).toBe('PUT');
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      '/api/v1/metrics/kpi.mau/assets/add',
    );
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      assets: [{ id: 't1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' }],
    });
    expect(result).toMatchObject({ status: 'SUCCESS', numberOfRowsPassed: 1 });
  });

  it('PUTs {assets} to /v1/metrics/{fqn}/assets/remove by FQN', async () => {
    let seenInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seenInit = init;
        return jsonResponse({ status: 'SUCCESS', numberOfRowsPassed: 1 });
      }),
    );
    const result = await removeAssetsFromMetric('kpi.mau', [
      { id: 't1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' },
    ]);
    expect(seenInit?.method).toBe('PUT');
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      '/api/v1/metrics/kpi.mau/assets/remove',
    );
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      assets: [{ id: 't1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' }],
    });
    expect(result).toMatchObject({ status: 'SUCCESS', numberOfRowsPassed: 1 });
  });
});
