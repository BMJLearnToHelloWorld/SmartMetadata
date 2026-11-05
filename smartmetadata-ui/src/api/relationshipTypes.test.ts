/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRelationshipType,
  deleteRelationshipType,
  getRelationTypeUsageCounts,
  listAllRelationshipTypes,
  mapRelationshipType,
} from './relationshipTypes';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('relationshipTypes API', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaryTerms/relationTypes/usage')) {
          return jsonResponse([{ relationshipType: { name: 'isA' }, count: 3 }]);
        }
        if (url.includes('/api/v1/relationshipTypes')) {
          if (init?.method === 'POST' || init?.method === 'PUT') {
            return jsonResponse({
              id: 'r1',
              name: 'isA',
              displayName: 'Is A',
              description: '',
              rdfPredicate: 'http://example.test/isA',
              category: 'CORE',
              characteristics: [],
              crossGlossaryAllowed: true,
              paletteKey: 'VIOLET',
              systemDefined: false,
            });
          }
          if (init?.method === 'DELETE') {
            return jsonResponse({});
          }
          if (url.includes('after=page2')) {
            return jsonResponse({
              data: [{ id: 'r2', name: 'partOf', displayName: 'Part Of' }],
              paging: { total: 2 },
            });
          }
          return jsonResponse({
            data: [{ id: 'r1', name: 'isA', displayName: 'Is A', category: 'CORE' }],
            paging: { total: 2, after: 'page2' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a relationship type and follows paging to fetch all', async () => {
    const types = await listAllRelationshipTypes();
    expect(types.map((type) => type.name)).toEqual(['isA', 'partOf']);
    expect(types[0].category).toBe('CORE');
  });

  it('reduces usage counts to a name-to-count map', async () => {
    expect(await getRelationTypeUsageCounts()).toEqual({ isA: 3 });
  });

  it('posts creates and deletes with hardDelete', async () => {
    await createRelationshipType({
      name: 'isA',
      displayName: 'Is A',
      description: '',
      rdfPredicate: 'http://example.test/isA',
      category: 'CORE',
      paletteKey: 'VIOLET',
    });
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(post?.[0])).toContain('/api/v1/relationshipTypes');
    await deleteRelationshipType('r1', true);
    const del = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(String(del?.[0])).toContain('hardDelete=true');
  });

  it('rejects records without id or name', () => {
    expect(mapRelationshipType({ name: 'x' })).toBeNull();
    expect(mapRelationshipType({ id: 'r1' })).toBeNull();
  });
});
