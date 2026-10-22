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
import { tagsPatch } from '@/governance/assetPatch';
import { fetchAssetDetail, patchAsset } from './entities';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('asset entity writes', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads owners, tags, and domains from the wired table GET', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            description: 'Orders fact',
            owners: [{ id: 'u1', name: 'alice', type: 'user' }],
            tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }],
            domains: [{ id: 'd1', name: 'Marketing', type: 'domain' }],
            columns: [{ name: 'id', dataType: 'BIGINT' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const asset = await fetchAssetDetail('table', 'svc.db.schema.orders');
    expect(asset.id).toBe('tbl-1');
    expect(asset.owners[0]).toMatchObject({ id: 'u1', type: 'user' });
    expect(asset.tags[0]).toMatchObject({ tagFQN: 'PII.Sensitive', source: 'Classification' });
    expect(asset.domains[0]).toMatchObject({ id: 'd1', type: 'domain' });
    expect(lastFetch().url).toContain('/api/v1/tables/name/');
    expect(lastFetch().url).toContain('domains');
  });

  it('PATCHes a table by id with RFC 6902 json-patch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    await patchAsset(
      'table',
      'tbl-1',
      tagsPatch([], [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }]),
    );
    expect(lastFetch().url).toContain('/api/v1/tables/tbl-1');
    expect(lastFetch().init?.method).toBe('PATCH');
    expect((lastFetch().init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json-patch+json',
    );
  });
});
