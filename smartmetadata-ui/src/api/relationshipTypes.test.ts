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
  RELATIONSHIP_TYPE_FIELDS,
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

  it('maps the six unedited fields alongside the edited ones', () => {
    expect(
      mapRelationshipType({
        id: 'r1',
        name: 'isA',
        displayName: 'Is A',
        description: 'd',
        iri: 'http://example.test/isA',
        rdfPredicate: 'http://example.test/isA',
        category: 'CUSTOM',
        characteristics: ['TRANSITIVE'],
        cardinality: { sourceMax: 1 },
        crossGlossaryAllowed: true,
        paletteKey: 'VIOLET',
        systemDefined: false,
        inverse: { fullyQualifiedName: 'relatedTo', name: 'relatedTo', type: 'relationshipType' },
        owners: [{ id: 'u1', name: 'admin', type: 'user' }],
        reviewers: [{ id: 'u2', name: 'rev', type: 'user' }],
        disjointWith: [
          { fullyQualifiedName: 'otherType', name: 'other', type: 'relationshipType' },
          { name: 'nameOnly', type: 'relationshipType' },
        ],
        domain: [
          {
            iri: 'http://example.test/Domain',
            term: { id: 't1', name: 'term1', type: 'glossaryTerm' },
          },
        ],
        entityStatus: 'In Review',
        propertyChain: [
          { fullyQualifiedName: 'a', type: 'relationshipType' },
          { fullyQualifiedName: 'b', type: 'relationshipType' },
        ],
        range: [],
        replacedBy: { fullyQualifiedName: 'newType', name: 'newType', type: 'relationshipType' },
      }),
    ).toEqual({
      id: 'r1',
      name: 'isA',
      displayName: 'Is A',
      description: 'd',
      iri: 'http://example.test/isA',
      rdfPredicate: 'http://example.test/isA',
      category: 'CUSTOM',
      characteristics: ['TRANSITIVE'],
      cardinality: { sourceMax: 1 },
      crossGlossaryAllowed: true,
      paletteKey: 'VIOLET',
      systemDefined: false,
      inverse: 'relatedTo',
      owners: [{ id: 'u1', name: 'admin', type: 'user' }],
      reviewers: [{ id: 'u2', name: 'rev', type: 'user' }],
      disjointWith: ['otherType', 'nameOnly'],
      domain: [
        {
          iri: 'http://example.test/Domain',
          term: { id: 't1', name: 'term1', type: 'glossaryTerm' },
        },
      ],
      entityStatus: 'In Review',
      propertyChain: ['a', 'b'],
      range: [],
      replacedBy: 'newType',
    });
  });

  it('keeps the six unedited fields absent when the server omits them', () => {
    const mapped = mapRelationshipType({ id: 'r1', name: 'isA' });
    expect(mapped?.disjointWith).toBeUndefined();
    expect(mapped?.domain).toBeUndefined();
    expect(mapped?.entityStatus).toBeUndefined();
    expect(mapped?.propertyChain).toBeUndefined();
    expect(mapped?.range).toBeUndefined();
    expect(mapped?.replacedBy).toBeUndefined();
  });

  it('keeps empty arrays empty instead of normalizing them to absent', () => {
    const mapped = mapRelationshipType({
      id: 'r1',
      name: 'isA',
      disjointWith: [],
      domain: [],
      propertyChain: [],
      range: [],
    });
    expect(mapped?.disjointWith).toEqual([]);
    expect(mapped?.domain).toEqual([]);
    expect(mapped?.propertyChain).toEqual([]);
    expect(mapped?.range).toEqual([]);
  });

  it('keeps a nameless reference as an empty name instead of dropping it', () => {
    const mapped = mapRelationshipType({
      id: 'r1',
      name: 'isA',
      disjointWith: [{ type: 'relationshipType' }],
      propertyChain: ['not-a-record'],
    });
    expect(mapped?.disjointWith).toEqual(['']);
    expect(mapped?.propertyChain).toEqual(['']);
  });

  it('drops semantic references without an iri', () => {
    const mapped = mapRelationshipType({
      id: 'r1',
      name: 'isA',
      domain: [
        { term: { id: 't0', name: 'term0', type: 'glossaryTerm' } },
        'not-a-record',
        { iri: 'http://example.test/Domain', term: { id: 't1', name: 'term1', type: 'glossaryTerm' } },
      ],
    });
    expect(mapped?.domain).toEqual([
      {
        iri: 'http://example.test/Domain',
        term: { id: 't1', name: 'term1', type: 'glossaryTerm' },
      },
    ]);
  });

  it('maps each known entity status and drops unknown values', () => {
    for (const status of [
      'Approved',
      'Archived',
      'Deprecated',
      'Draft',
      'In Review',
      'Rejected',
      'Unprocessed',
    ]) {
      expect(mapRelationshipType({ id: 'r1', name: 'isA', entityStatus: status })?.entityStatus).toBe(
        status,
      );
    }
    expect(
      mapRelationshipType({ id: 'r1', name: 'isA', entityStatus: 'Bogus' })?.entityStatus,
    ).toBeUndefined();
    expect(
      mapRelationshipType({ id: 'r1', name: 'isA', entityStatus: 42 })?.entityStatus,
    ).toBeUndefined();
  });

  it('keeps an empty replacedBy name but drops a missing reference', () => {
    expect(
      mapRelationshipType({ id: 'r1', name: 'isA', replacedBy: { type: 'relationshipType' } })
        ?.replacedBy,
    ).toBe('');
    expect(mapRelationshipType({ id: 'r1', name: 'isA' })?.replacedBy).toBeUndefined();
    expect(
      mapRelationshipType({ id: 'r1', name: 'isA', replacedBy: 'not-a-record' })?.replacedBy,
    ).toBeUndefined();
  });

  it('resolves inverse from the reference name and keeps surrounding spaces', () => {
    expect(
      mapRelationshipType({
        id: 'r1',
        name: 'isA',
        inverse: { fullyQualifiedName: ' relatedTo ', name: 'relatedTo', type: 'relationshipType' },
      })?.inverse,
    ).toBe(' relatedTo ');
    expect(
      mapRelationshipType({ id: 'r1', name: 'isA', inverse: { name: 'nm' } })?.inverse,
    ).toBe('nm');
    expect(
      mapRelationshipType({
        id: 'r1',
        name: 'isA',
        inverse: { fullyQualifiedName: '', name: 'fallback' },
      })?.inverse,
    ).toBeUndefined();
  });

  it('sends fields on every page when the caller passes them', async () => {
    await listAllRelationshipTypes(RELATIONSHIP_TYPE_FIELDS);
    const calls = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).includes('/api/v1/relationshipTypes'));
    expect(calls).toHaveLength(2);
    for (const [input] of calls) {
      expect(String(input)).toContain('fields=owners%2Creviewers');
      expect(String(input)).toContain('limit=1000');
    }
  });

  it('sends no fields param when the caller passes none', async () => {
    await listAllRelationshipTypes();
    const calls = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).includes('/api/v1/relationshipTypes'));
    expect(calls).toHaveLength(2);
    for (const [input] of calls) {
      expect(String(input)).not.toContain('fields=');
    }
  });

  it('rejects when the usage endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'usage down' }, 500)),
    );
    await expect(getRelationTypeUsageCounts()).rejects.toThrow();
  });
});
