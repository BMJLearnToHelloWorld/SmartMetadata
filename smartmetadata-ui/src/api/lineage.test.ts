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
  deleteEntityLineageByName,
  exportLineageAsync,
  exportLineageByEntityCountAsync,
  fetchEntityLineage,
  getDataQualityLineage,
  getLineageByEntityCount,
  getLineageEdgeDetails,
  getLineagePagingData,
  getLineageScene,
  getPlatformLineage,
  isLineageNotFound,
  putEntityLineage,
  searchLineage,
} from './lineage';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

const SAMPLE = {
  entity: {
    id: 'center-id',
    type: 'table',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
  },
  nodes: [],
  upstreamEdges: [],
  downstreamEdges: [],
};

describe('lineage API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('GETs /v1/lineage/{entity}/name/{fqn} with clamped depths', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(SAMPLE), { status: 200 })),
    );

    const body = (await fetchEntityLineage({
      entityType: 'table',
      fqn: 'svc.db."Sales Schema".orders',
      upstreamDepth: 2,
      downstreamDepth: 1,
    })) as { entity?: { id?: string } };

    expect((body as { entity?: { id?: unknown } }).entity?.id).toBe('center-id');
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/lineage/table/name/');
    expect(url).toContain(encodeURIComponent('svc.db."Sales Schema".orders'));
    expect(url).toContain('upstreamDepth=2');
    expect(url).toContain('downstreamDepth=1');
    expect(init?.method ?? 'GET').toBe('GET');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('clamps depths to the LineageResource 0-3 range', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(SAMPLE), { status: 200 })),
    );

    await fetchEntityLineage({
      entityType: 'topic',
      fqn: 'kafka.events',
      upstreamDepth: 99,
      downstreamDepth: -4,
    });

    const { url } = lastFetch();
    expect(url).toContain('/api/v1/lineage/topic/name/');
    expect(url).toContain('upstreamDepth=3');
    expect(url).toContain('downstreamDepth=0');
  });

  it('rejects an empty entity type or FQN without inventing a path', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchEntityLineage({ entityType: '', fqn: 'x' })).rejects.toThrow(/entity type/i);
    await expect(fetchEntityLineage({ entityType: 'table', fqn: '' })).rejects.toThrow(/fqn/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('PUTs /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn} with Manual source', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await putEntityLineage({
      fromType: 'table',
      fromFqn: 'svc.db."Sales Schema".a',
      toType: 'table',
      toFqn: 'svc.db.schema.b',
    });

    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/lineage/table/name/');
    expect(url).toContain(encodeURIComponent('svc.db."Sales Schema".a'));
    expect(url).toContain('/table/name/');
    expect(url).toContain(encodeURIComponent('svc.db.schema.b'));
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ source: 'Manual' });
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('DELETEs lineage edge by name matching RestClient.delete_lineage_by_name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );

    await deleteEntityLineageByName({
      fromType: 'table',
      fromFqn: 'svc.db.schema.a',
      toType: 'table',
      toFqn: 'svc.db.schema.b',
    });

    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/lineage/table/name/svc.db.schema.a/table/name/svc.db.schema.b');
    expect(init?.method).toBe('DELETE');
  });

  it('rejects incomplete write endpoints without calling fetch', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      putEntityLineage({ fromType: '', fromFqn: 'a', toType: 'table', toFqn: 'b' }),
    ).rejects.toThrow(/entity types/i);
    await expect(
      deleteEntityLineageByName({ fromType: 'table', fromFqn: '', toType: 'table', toFqn: 'b' }),
    ).rejects.toThrow(/FQN/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('GETs /v1/lineage/getLineage with time params only when a range is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nodes: {} }), { status: 200 })),
    );
    await searchLineage({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
      upstreamDepth: 1,
      downstreamDepth: 1,
      size: 50,
      startTime: 1000,
      endTime: 2000,
    });
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/lineage/getLineage');
    expect(url).toContain('fqn=svc.db.schema.orders');
    expect(url).toContain('type=table');
    expect(url).toContain('startTime=1000');
    expect(url).toContain('endTime=2000');
    expect(url).toContain('size=50');
    expect(url).toContain('includeDeleted=false');
  });

  it('omits time params for all-time search lineage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nodes: {} }), { status: 200 })),
    );
    await searchLineage({ entityType: 'table', fqn: 'svc.db.schema.orders' });
    const url = lastFetch().url;
    expect(url).not.toContain('startTime');
    expect(url).not.toContain('endTime');
  });

  it('GETs /v1/lineage/getPlatformLineage with view and includeDeleted=false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nodes: {} }), { status: 200 })),
    );
    await getPlatformLineage({ view: 'service' });
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/lineage/getPlatformLineage');
    expect(url).toContain('view=service');
    expect(url).toContain('includeDeleted=false');
    expect(url).not.toContain('query_filter');
    expect(url).not.toContain('upstreamDepth');
    expect(url).not.toContain('size=');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('passes query_filter through for platform lineage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nodes: {} }), { status: 200 })),
    );
    await getPlatformLineage({ view: 'domain', queryFilter: '{"term":{"x":1}}' });
    const { url } = lastFetch();
    expect(url).toContain('view=domain');
    expect(url).toContain(`query_filter=${encodeURIComponent('{"term":{"x":1}}')}`);
  });

  it('sends query_filter/column_filter and the directional path like getLineageDataByFQN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nodes: {} }), { status: 200 })),
    );
    await searchLineage({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
      upstreamDepth: 1,
      downstreamDepth: 0,
      direction: 'Upstream',
      queryFilter: '{"query":{"bool":{"must":[]}}}',
      columnFilter: 'columnName:customer_id',
    });
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/lineage/getLineage/Upstream');
    expect(url).toContain('upstreamDepth=1');
    expect(url).toContain('downstreamDepth=0');
    expect(url).toContain(`query_filter=${encodeURIComponent('{"query":{"bool":{"must":[]}}}')}`);
    expect(url).toContain(`column_filter=${encodeURIComponent('columnName:customer_id')}`);
  });

  it('GETs /v1/lineage/getDataQualityLineage with upstreamDepth default 1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nodes: [], edges: [] }), { status: 200 })),
    );
    const body = (await getDataQualityLineage({
      fqn: 'svc.db.schema.orders',
      queryFilter: '{"query":{"bool":{"must":[]}}}',
    })) as { nodes?: unknown[] };
    expect(body.nodes).toEqual([]);
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/lineage/getDataQualityLineage');
    expect(url).toContain('fqn=svc.db.schema.orders');
    expect(url).toContain('upstreamDepth=1');
    expect(url).toContain('includeDeleted=false');
    expect(url).toContain(`query_filter=${encodeURIComponent('{"query":{"bool":{"must":[]}}}')}`);
  });

  it('rejects an empty FQN for DQ lineage without calling fetch', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(getDataQualityLineage({ fqn: '  ' })).rejects.toThrow(/fqn/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('GETs /v1/lineage/exportAsync with pin defaults (depths 1) and returns the job record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ jobId: 'job-1', message: 'Export initiated successfully.' }), { status: 202 })),
    );
    const job = await exportLineageAsync({
      fqn: 'svc.db.schema.orders',
      entityType: 'table',
      queryFilter: '{"query":{"bool":{"must":[]}}}',
      startTime: 1000,
      endTime: 2000,
    });
    expect(job).toEqual({ jobId: 'job-1', message: 'Export initiated successfully.' });
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/lineage/exportAsync');
    expect(url).toContain('fqn=svc.db.schema.orders');
    expect(url).toContain('type=table');
    expect(url).toContain('upstreamDepth=1');
    expect(url).toContain('downstreamDepth=1');
    expect(url).toContain('includeDeleted=false');
    expect(url).toContain(`query_filter=${encodeURIComponent('{"query":{"bool":{"must":[]}}}')}`);
    expect(url).toContain('startTime=1000');
    expect(url).toContain('endTime=2000');
  });

  it('GETs /v1/lineage/getLineageByEntityCount with the pin count params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nodes: {}, paginationInfo: null }), { status: 200 })),
    );
    const body = (await getLineageByEntityCount({
      fqn: 'svc.db.schema.orders',
      entityType: 'table',
      direction: 'Downstream',
      nodeDepth: 2,
      upstreamDepth: 3,
      downstreamDepth: 3,
      from: 15,
      size: 15,
      queryFilter: '{"query":{"bool":{"must":[]}}}',
      columnFilter: 'columnName:customer_id',
      includePaginationInfo: true,
    })) as { nodes?: unknown };
    expect(body.nodes).toEqual({});
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/lineage/getLineageByEntityCount');
    expect(url).toContain('fqn=svc.db.schema.orders');
    expect(url).toContain('entityType=table');
    expect(url).toContain('direction=Downstream');
    expect(url).toContain('nodeDepth=2');
    expect(url).toContain('maxDepth=2');
    expect(url).toContain('upstreamDepth=3');
    expect(url).toContain('downstreamDepth=3');
    expect(url).toContain('from=15');
    expect(url).toContain('size=15');
    expect(url).toContain('include_pagination_info=true');
    expect(url).toContain(`query_filter=${encodeURIComponent('{"query":{"bool":{"must":[]}}}')}`);
    expect(url).toContain(`column_filter=${encodeURIComponent('columnName:customer_id')}`);
    // Pin sends `type: undefined`; the product never sends `type` on this endpoint.
    expect(url).not.toContain('type=');
  });

  it('defaults maxDepth to nodeDepth on the count call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nodes: {} }), { status: 200 })),
    );
    await getLineageByEntityCount({
      fqn: 'svc.db.schema.orders',
      entityType: 'table',
      direction: 'Upstream',
      nodeDepth: 1,
    });
    expect(lastFetch().url).toContain('maxDepth=1');
  });

  it('rejects a missing direction or node depth for the count call without fetching', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      getLineageByEntityCount({
        fqn: 'svc.db.schema.orders',
        entityType: 'table',
        direction: 'Sideways' as 'Downstream',
        nodeDepth: 1,
      }),
    ).rejects.toThrow(/direction/i);
    await expect(
      getLineageByEntityCount({
        fqn: 'svc.db.schema.orders',
        entityType: 'table',
        direction: 'Downstream',
        nodeDepth: -1,
      }),
    ).rejects.toThrow(/depth/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('GETs /v1/lineage/exportByEntityCountAsync and returns the job id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ jobId: 'job-1', message: 'ok' }), { status: 200 })),
    );
    const job = await exportLineageByEntityCountAsync({
      fqn: 'svc.db.schema.orders',
      entityType: 'table',
      direction: 'Downstream',
      nodeDepth: 2,
      queryFilter: '{"query":{"bool":{"must":[]}}}',
      startTime: 1000,
      endTime: 2000,
    });
    expect(job).toEqual({ jobId: 'job-1' });
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/lineage/exportByEntityCountAsync');
    expect(url).toContain('direction=Downstream');
    expect(url).toContain('nodeDepth=2');
    expect(url).toContain('maxDepth=2');
    expect(url).toContain('startTime=1000');
    expect(url).toContain('endTime=2000');
  });

  it('rejects an empty FQN for async export without calling fetch', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(exportLineageAsync({ fqn: '  ' })).rejects.toThrow(/fqn/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('GETs /v1/lineage/getLineageEdge/{from}/{to} and returns response.edge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ edge: { source: 'Manual', columnsLineage: [] } }), { status: 200 }),
      ),
    );
    const edge = await getLineageEdgeDetails('from-id', 'to-id');
    expect(edge).toEqual({ source: 'Manual', columnsLineage: [] });
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/lineage/getLineageEdge/from-id/to-id');
  });

  it('rejects empty edge ids without calling fetch, and recognises a 404 ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(getLineageEdgeDetails('', 'to-id')).rejects.toThrow(/ids/i);
    await expect(getLineageEdgeDetails('from-id', '')).rejects.toThrow(/ids/i);
    expect(fetch).not.toHaveBeenCalled();
    const { ApiError } = await import('./client');
    expect(isLineageNotFound(new ApiError(404, '', 'Not found'))).toBe(true);
    expect(isLineageNotFound(new ApiError(500, '', 'Server error'))).toBe(false);
    expect(isLineageNotFound(new Error('boom'))).toBe(false);
  });

  it('GETs /v1/lineage/getPaginationInfo with depths and the query filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ totalDownstreamEntities: 5 }), { status: 200 })),
    );
    await getLineagePagingData({
      fqn: 'svc.db.schema.orders',
      upstreamDepth: 3,
      downstreamDepth: 3,
      entityType: 'table',
      queryFilter: '{"query":{"bool":{"must":[]}}}',
    });
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/lineage/getPaginationInfo');
    expect(url).toContain('fqn=svc.db.schema.orders');
    expect(url).toContain('upstreamDepth=3');
    expect(url).toContain('downstreamDepth=3');
    expect(url).toContain('entityType=table');
    expect(url).toContain(`query_filter=${encodeURIComponent('{"query":{"bool":{"must":[]}}}')}`);
  });

  it('GETs /v1/lineage/scene with lens, band and the official defaults', async () => {
    const scenePayload = { band: 'LAYER', lens: 'service', breadcrumb: [], edges: [], nodes: [] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(scenePayload), { status: 200 })),
    );

    const body = await getLineageScene({ lens: 'service', band: 'LAYER' });

    expect(body).toEqual(scenePayload);
    const { url } = lastFetch();
    expect(url).toContain('/api/v1/lineage/scene');
    expect(url).toContain('lens=service');
    expect(url).toContain('band=LAYER');
    expect(url).toContain('upstreamDepth=1');
    expect(url).toContain('downstreamDepth=1');
    expect(url).toContain('size=200');
    expect(url).toContain('includeDeleted=false');
    expect(url).not.toContain('focusFqn=');
  });

  it('sends focus, depths and query filter to the scene endpoint, capping depths at 3', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ band: 'ASSET' }), { status: 200 })),
    );

    await getLineageScene({
      lens: 'domain',
      band: 'ASSET',
      focusFqn: 'sales',
      entityType: 'domain',
      upstreamDepth: 9,
      downstreamDepth: 2,
      nodesPerLayer: 50,
      queryFilter: '{"query":{}}',
    });

    const { url } = lastFetch();
    expect(url).toContain('lens=domain');
    expect(url).toContain('focusFqn=sales');
    expect(url).toContain('entityType=domain');
    expect(url).toContain('upstreamDepth=3');
    expect(url).toContain('downstreamDepth=2');
    expect(url).toContain('size=50');
    expect(url).toContain(`query_filter=${encodeURIComponent('{"query":{}}')}`);
  });

  it('rejects a half-formed scene focus without fetching', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      getLineageScene({ lens: 'service', band: 'ASSET', focusFqn: 'svc' }),
    ).rejects.toThrow(/both an FQN and an entity type/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('GETs edge details by encoded ids and unwraps the { edge } response', async () => {
    const details = { source: 'PipelineLineage', sqlQuery: 'select 1' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ edge: details }), { status: 200 })),
    );

    await expect(getLineageEdgeDetails('from/id', 'to id')).resolves.toEqual(details);
    const { url } = lastFetch();
    expect(url).toContain('/api/v1/lineage/getLineageEdge/from%2Fid/to%20id');
  });

  it('rejects empty edge ids without fetching', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(getLineageEdgeDetails('', 'b')).rejects.toThrow(/from and to entity ids/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
