/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { persistSession } from '@/auth/token';
import { apiEndpointLocation, listApiEndpoints } from './apiCollections';

beforeEach(() => {
  persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    expect(url).toContain('/api/v1/apiEndpoints');
    expect(url).toContain('apiCollection=svc.coll');
    return new Response(JSON.stringify({
      data: [
        { name: 'getPet', displayName: 'Get pet', endpointURL: '/pets/{id}', requestMethod: 'GET', fullyQualifiedName: 'svc.coll.getPet' },
        { name: 'noUrl', fullyQualifiedName: 'svc.coll.noUrl' },
      ],
      paging: { total: 2 },
    }), { headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('apiCollections', () => {
  it('lists endpoints filtered by collection FQN and maps fields', async () => {
    const page = await listApiEndpoints({ apiCollection: 'svc.coll' });
    expect(page.data).toHaveLength(2);
    expect(page.data[0]).toMatchObject({ name: 'getPet', endpointURL: '/pets/{id}', requestMethod: 'GET' });
    expect(page.data[1].endpointURL).toBeUndefined();
  });

  it('routes an endpoint row to the generic asset detail route', () => {
    expect(apiEndpointLocation({ name: 'getPet', fullyQualifiedName: 'svc.coll.getPet' })).toEqual({
      name: 'asset',
      params: { entityType: 'apiEndpoint', fqn: 'svc.coll.getPet' },
    });
  });
});
