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
  fetchEntityLineage,
  putEntityLineage,
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

    const body = await fetchEntityLineage({
      entityType: 'table',
      fqn: 'svc.db."Sales Schema".orders',
      upstreamDepth: 2,
      downstreamDepth: 1,
    });

    expect(body.entity?.id).toBe('center-id');
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
});
