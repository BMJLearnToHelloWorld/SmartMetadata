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
import { createDomain, listDomainAssets, listDomains } from './domains';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('domains API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists domains from GET /v1/domains', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'd1', name: 'Marketing', description: 'Growth', domainType: 'Consumer-aligned' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listDomains({ limit: 50 });
    expect(page.data[0]?.domainType).toBe('Consumer-aligned');
    expect(lastFetch().url).toContain('/api/v1/domains');
  });

  it('creates a domain with schema-required name, description, and domainType', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: 'Payments',
          description: 'Money movement',
          domainType: 'Source-aligned',
        });
        return new Response(
          JSON.stringify({
            id: 'd2',
            name: 'Payments',
            description: 'Money movement',
            domainType: 'Source-aligned',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const created = await createDomain({
      name: 'Payments',
      description: 'Money movement',
      domainType: 'Source-aligned',
    });
    expect(created.id).toBe('d2');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('lists domain assets from GET /v1/domains/{id}/assets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'a1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listDomainAssets('d1');
    expect(page.data[0]?.name).toBe('orders');
    expect(lastFetch().url).toContain('/api/v1/domains/d1/assets');
  });
});
