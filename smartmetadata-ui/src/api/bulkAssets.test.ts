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
import { addBulkAssets, getDomainDryRunImpacts } from './bulkAssets';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('bulkAssets dryRun', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('sends dryRun: true on the same add body and maps hasSideEffects rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toEqual({
          assets: [{ id: 'a1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.orders' }],
          dryRun: true,
        });
        return new Response(
          JSON.stringify({
            successRequest: [
              {
                request: { id: 'a1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.orders' },
                hasSideEffects: true,
              },
              {
                request: { id: 'a2', type: 'table', name: 'items', fullyQualifiedName: 'svc.db.items' },
                hasSideEffects: false,
              },
            ],
            failedRequest: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const result = await addBulkAssets(
      'domains',
      'finance',
      [{ id: 'a1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.orders' }],
      { dryRun: true },
    );
    expect(lastFetch().url).toContain('/api/v1/domains/finance/assets/add');
    expect(lastFetch().init?.method).toBe('PUT');
    const impacts = getDomainDryRunImpacts(result);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]?.request?.id).toBe('a1');
  });

  it('omits dryRun from the real submit body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).not.toHaveProperty('dryRun');
        return new Response(JSON.stringify({ successRequest: [], failedRequest: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const result = await addBulkAssets('domains', 'finance', [
      { id: 'a1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.orders' },
    ]);
    expect(getDomainDryRunImpacts(result)).toEqual([]);
  });
});
