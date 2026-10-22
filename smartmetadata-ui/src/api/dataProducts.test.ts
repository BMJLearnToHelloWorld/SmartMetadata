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
import { createDataProduct, listDataProducts } from './dataProducts';

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
});
