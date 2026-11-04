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
  addDataProductAssets,
  createDataProduct,
  getDataProductByName,
  listDataProducts,
  removeDataProductAssets,
} from './dataProducts';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('dataProducts API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists data products from GET /v1/dataProducts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'p1',
                name: 'churn',
                description: 'Churn scores',
                domains: [{ id: 'd1', name: 'Marketing', type: 'domain' }],
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listDataProducts({ limit: 50 });
    expect(page.data[0]?.name).toBe('churn');
    expect(lastFetch().url).toContain('/api/v1/dataProducts');
  });

  it('creates a data product with schema-required name, description, and domains', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: 'sentiment',
          description: 'Sentiment scores',
          domains: ['Marketing'],
        });
        return new Response(
          JSON.stringify({
            id: 'p2',
            name: 'sentiment',
            description: 'Sentiment scores',
            domains: [{ name: 'Marketing', type: 'domain' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const created = await createDataProduct({
      name: 'sentiment',
      description: 'Sentiment scores',
      domains: ['Marketing'],
    });
    expect(created.id).toBe('p2');
    expect(lastFetch().init?.method).toBe('POST');
    expect(lastFetch().url).toContain('/api/v1/dataProducts');
  });

  it('resolves a data product by name from GET /v1/dataProducts/name/{name}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ id: 'p3', name: 'churn', fullyQualifiedName: 'churn' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const product = await getDataProductByName('churn');
    expect(product.id).toBe('p3');
    expect(lastFetch().url).toContain('/api/v1/dataProducts/name/churn');
  });

  it('adds assets with PUT /v1/dataProducts/{fqn}/assets/add and maps the bulk result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: 'success',
            numberOfRowsProcessed: 2,
            numberOfRowsPassed: 1,
            numberOfRowsFailed: 1,
            numberOfRowsPendingApproval: 0,
            successRequest: [{ request: { id: 'a1', name: 'orders', type: 'table' }, status: 200 }],
            failedRequest: [
              { request: { id: 'a2', name: 'secret', type: 'table' }, message: 'Denied', status: 403 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const result = await addDataProductAssets('marketing.churn', [
      { id: 'a1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' },
      { id: 'a2', name: 'secret', type: 'table', fullyQualifiedName: 'svc.db.secret' },
    ]);
    expect(lastFetch().url).toContain('/api/v1/dataProducts/marketing.churn/assets/add');
    expect(lastFetch().init?.method).toBe('PUT');
    const body = JSON.parse(String(lastFetch().init?.body));
    expect(body.assets).toHaveLength(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedRequests[0]?.message).toBe('Denied');
  });

  it('removes assets with PUT /v1/dataProducts/{fqn}/assets/remove', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ status: 'success', numberOfRowsPassed: 1, successRequest: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const result = await removeDataProductAssets('marketing.churn', [
      { id: 'a1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' },
    ]);
    expect(lastFetch().url).toContain('/api/v1/dataProducts/marketing.churn/assets/remove');
    expect(result.passed).toBe(1);
  });
});
