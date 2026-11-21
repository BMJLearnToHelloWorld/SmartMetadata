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
import { listContainerChildren } from './containers';

describe('containers API (D-2 batch 4: ContainerChildren)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists children by container FQN with offset paging and maps rows', async () => {
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        seenUrl = String(input);
        return new Response(
          JSON.stringify({
            data: [
              { id: 'k1', name: 'child-a', displayName: 'Child A', fullyQualifiedName: 'svc.bucket.child-a', description: 'First child' },
              { name: 'child-b', fullyQualifiedName: 'svc.bucket.child-b' },
            ],
            paging: { total: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const page = await listContainerChildren('svc.bucket', { limit: 10, offset: 0 });
    expect(seenUrl).toContain('/api/v1/containers/name/svc.bucket/children');
    expect(seenUrl).toContain('limit=10');
    expect(seenUrl).toContain('offset=0');
    expect(seenUrl).toContain('include=non-deleted');
    expect(page.data).toHaveLength(2);
    expect(page.data[0]).toMatchObject({ id: 'k1', displayName: 'Child A', description: 'First child' });
    expect(page.total).toBe(2);
  });

  it('passes the name substring filter and deleted include through', async () => {
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        seenUrl = String(input);
        return new Response(JSON.stringify({ data: [], paging: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await listContainerChildren('svc.bucket', { q: '  child ', include: 'deleted' });
    expect(seenUrl).toContain('q=child');
    expect(seenUrl).toContain('include=deleted');
  });

  it('omits a blank search filter', async () => {
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        seenUrl = String(input);
        return new Response(JSON.stringify({ data: [], paging: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await listContainerChildren('svc.bucket', { q: '   ' });
    expect(seenUrl).not.toContain('q=');
  });
});
