/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNLPEnabledStatus, nlqSearch, searchAssets } from './search';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('searchAssets', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [{ _source: { name: 'orders', fullyQualifiedName: 'svc.db.schema.orders', entityType: 'table' } }],
          },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to the dataAsset index with aggregations', async () => {
    await searchAssets('orders', 0, 20);
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain('/api/v1/search/query');
    expect(url).toContain('q=orders');
    expect(url).toContain('index=dataAsset');
    expect(url).toContain('include_aggregations=true');
  });

  it('forwards sort_field and sort_order when Explore asks for popularity', async () => {
    await searchAssets('orders', 0, 20, { sortField: 'totalVotes', sortOrder: 'desc' });
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain('sort_field=totalVotes');
    expect(url).toContain('sort_order=desc');
  });

  it('sends deleted only when showDeleted opts in', async () => {
    await searchAssets('orders', 0, 15, { deleted: true });
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('deleted=true');
    await searchAssets('orders', 0, 15, { deleted: false });
    expect(String(vi.mocked(fetch).mock.calls[1][0])).not.toContain('deleted=');
    await searchAssets('orders', 0, 15);
    expect(String(vi.mocked(fetch).mock.calls[2][0])).not.toContain('deleted=');
  });

  it('nlqSearch queries GET /v1/search/nlq/query with the UI nlq params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [{ _source: { name: 'orders', fullyQualifiedName: 'svc.db.schema.orders', entityType: 'table' } }],
          },
        }),
      ),
    );
    const page = await nlqSearch('top selling products', 0, 10, { index: 'dataProduct' });
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.pathname).toContain('/api/v1/search/nlq/query');
    expect(url.searchParams.get('q')).toBe('top selling products');
    expect(url.searchParams.get('index')).toBe('dataProduct');
    expect(url.searchParams.get('size')).toBe('10');
    expect(url.searchParams.get('from')).toBe('0');
    expect(page.hits[0]?.name).toBe('orders');
  });

  it('getNLPEnabledStatus returns true only for a true payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(true)));
    expect(await getNLPEnabledStatus()).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(false)));
    expect(await getNLPEnabledStatus()).toBe(false);
  });

  it('can skip aggregations for My Data owned/followed term queries', async () => {
    await searchAssets('owners.id:"u-1"', 0, 5, { includeAggregations: false });
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain(encodeURIComponent('owners.id:"u-1"'));
    expect(url).toContain('include_aggregations=false');
    expect(url).toContain('size=5');
  });
});
