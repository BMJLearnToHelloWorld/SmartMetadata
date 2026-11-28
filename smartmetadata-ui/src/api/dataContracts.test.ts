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
import { getContractByEntityId, mapDataContract, updateContract } from './dataContracts';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('dataContracts API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads the effective contract from GET /v1/dataContracts/entity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'c1',
            name: 'orders-contract',
            latestResult: { status: 'Success', timestamp: 1700000000000, message: 'All checks passed' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const contract = await getContractByEntityId('table-1', 'table');
    expect(contract?.id).toBe('c1');
    expect(contract?.latestResult?.status).toBe('Success');
    expect(contract?.latestResult?.timestamp).toBe(1700000000000);
    expect(lastFetch().url).toContain('/api/v1/dataContracts/entity');
    expect(lastFetch().url).toContain('entityId=table-1');
    expect(lastFetch().url).toContain('entityType=table');
    expect(lastFetch().url).not.toContain('fields=');
  });

  it('returns null when no contract exists (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(getContractByEntityId('table-1', 'table')).resolves.toBeNull();
  });

  it('PATCHes an existing contract at /v1/dataContracts/{id}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'c1', name: 'orders-contract', description: 'Updated' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const updated = await updateContract('c1', [{ op: 'replace', path: '/description', value: 'Updated' }]);
    expect(updated?.description).toBe('Updated');
    expect(lastFetch().url).toContain('/api/v1/dataContracts/c1');
    expect(lastFetch().init?.method).toBe('PATCH');
    expect(new Headers(lastFetch().init?.headers).get('Content-Type')).toBe('application/json-patch+json');
  });

  it('maps inherited, semantics, sla, and termsOfUse from the official payload', () => {
    const mapped = mapDataContract({
      id: 'c1',
      name: 'orders',
      inherited: true,
      termsOfUse: { content: 'Be kind', inherited: false },
      sla: { availabilityTime: '09:00 UTC', timezone: 'GMT+00:00 (Europe/London)', maxLatency: { unit: 'hour', value: 4 } },
      semantics: [{ name: 'named', rule: '{"==":[1,1]}', enabled: true, jsonTree: '{}' }],
    });
    expect(mapped?.inherited).toBe(true);
    expect(mapped?.termsOfUse).toEqual({ content: 'Be kind', inherited: undefined });
    expect(mapped?.sla?.availabilityTime).toBe('09:00 UTC');
    expect(mapped?.sla?.maxLatency).toEqual({ unit: 'hour', value: 4 });
    expect(mapped?.semantics?.[0]).toMatchObject({ name: 'named', rule: '{"==":[1,1]}', enabled: true });
  });

  it('drops an unknown latestResult status instead of passing it through', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'c1', name: 'x', latestResult: { status: 'Bogus' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const contract = await getContractByEntityId('table-1', 'table');
    expect(contract?.latestResult?.status).toBeUndefined();
  });
});
