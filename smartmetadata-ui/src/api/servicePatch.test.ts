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
import { patchService } from './servicePatch';

describe('patchService', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('PATCHes /v1/services/{collection}/{id} with the JSON Patch media type', async () => {
    let seenInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        seenInit = init;
        return new Response(
          JSON.stringify({ id: 'svc-1', name: 'warehouse', serviceType: 'Postgres' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const patched = await patchService('database', 'svc-1', [
      { op: 'replace', path: '/owners', value: [{ id: 'u1', type: 'user' }] },
    ]);
    const call = vi.mocked(fetch).mock.calls.at(-1);
    expect(String(call?.[0])).toContain('/api/v1/services/databaseServices/svc-1');
    expect(seenInit?.method).toBe('PATCH');
    expect(new Headers(seenInit?.headers).get('Content-Type')).toBe('application/json-patch+json');
    expect(JSON.parse(String(seenInit?.body))).toEqual([
      { op: 'replace', path: '/owners', value: [{ id: 'u1', type: 'user' }] },
    ]);
    expect(patched).toMatchObject({ id: 'svc-1', name: 'warehouse', kind: 'database' });
  });

  it('routes each kind through its own collection and mapper', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'svc-2', name: 'events', serviceType: 'Kafka' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const patched = await patchService('messaging', 'svc-2', [
      { op: 'add', path: '/description', value: 'Topics here' },
    ]);
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain(
      '/api/v1/services/messagingServices/svc-2',
    );
    expect(patched.kind).toBe('messaging');
  });

  it('echoes the mapped PATCH response, including the new field values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'svc-1',
            name: 'warehouse',
            serviceType: 'Postgres',
            domains: [{ id: 'd1', name: 'finance', type: 'domain' }],
            version: 4,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const patched = await patchService('database', 'svc-1', [
      { op: 'replace', path: '/domains', value: [{ id: 'd1', type: 'domain' }] },
    ]);
    expect(patched.domains).toEqual([{ id: 'd1', name: 'finance', type: 'domain' }]);
    expect(patched.version).toBe(4);
  });

  it('refuses an empty op list without sending a request', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(patchService('database', 'svc-1', [])).rejects.toThrow(
      'at least one JSON Patch operation',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a patch response with neither id nor name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    await expect(
      patchService('database', 'svc-1', [{ op: 'replace', path: '/owners', value: [] }]),
    ).rejects.toThrow('missing id and name');
  });
});
