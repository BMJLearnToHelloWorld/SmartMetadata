/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMetricStatusQueryFilter,
  createMetric,
  deleteMetricAsync,
  exportMetricsCsvAsync,
  getCustomUnitsOfMeasurement,
  getMetricAncestorFqns,
  getMetricGroupMetrics,
  getMetricHierarchy,
  getMetricObservability,
  getMetricParentIds,
  getMetricSearchPaths,
  listMetrics,
  mapMetricHierarchyItem,
  METRIC_STATUS_VALUES,
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
