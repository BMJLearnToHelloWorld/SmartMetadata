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
import { getServiceByFqn, patchService } from './serviceLookup';

function lastFetchUrl(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

describe('getServiceByFqn', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('GETs the name endpoint with include/includeRelations defaults', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 's1', name: 'svc', serviceType: 'Mysql' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const service = await getServiceByFqn('database', 'my.service');
    expect(service.name).toBe('svc');
    const url = lastFetchUrl();
    expect(url).toContain('/v1/services/databaseServices/name/my.service');
    expect(url).toContain('include=non-deleted');
    expect(url).toContain('includeRelations=owners%3Anon-deleted%2Cexperts%3Anon-deleted');
  });

  it('encodes FQN segments and honors caller params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 's1', name: 'svc', serviceType: 'Kafka' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await getServiceByFqn('messaging', 'a/b c', {
      fields: 'owners',
      include: 'all',
      includeRelations: 'owners',
    });
    const url = lastFetchUrl();
    expect(url).toContain('/v1/services/messagingServices/name/a%2Fb%20c');
    expect(url).toContain('fields=owners');
    expect(url).toContain('include=all');
    expect(url).toContain('includeRelations=owners');
  });

  it('rejects when the response has no service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(getServiceByFqn('database', 'missing')).rejects.toThrow(
      'Service response was missing id and name',
    );
  });
});

describe('patchService', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('PATCHes the collection endpoint with a JSON Patch body and content type', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ id: 's1', name: 'svc', serviceType: 'Mysql', owners: [{ id: 'u1' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const patch = [
      { op: 'replace' as const, path: '/connection/config/hostPort', value: 'db2:5432' },
    ];
    const result = await patchService('database', 's1', patch);
    expect(result.id).toBe('s1');
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(new URL(String(url)).pathname).toBe('/api/v1/services/databaseServices/s1');
    expect(init?.method).toBe('PATCH');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json-patch+json',
    );
    expect(JSON.parse(String(init?.body))).toEqual(patch);
  });

  it('rejects when the response has no service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(patchService('database', 's1', [])).rejects.toThrow(
      'Service response was missing id and name',
    );
  });
});
