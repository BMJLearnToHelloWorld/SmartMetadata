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
import { searchAssets } from './search';

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

  it('can skip aggregations for My Data owned/followed term queries', async () => {
    await searchAssets('owners.id:"u-1"', 0, 5, { includeAggregations: false });
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain(encodeURIComponent('owners.id:"u-1"'));
    expect(url).toContain('include_aggregations=false');
    expect(url).toContain('size=5');
  });
});
