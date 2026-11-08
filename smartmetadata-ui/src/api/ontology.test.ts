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
import {
  createOntology,
  getOntology,
  getOntologyConcept,
  getOntologyConceptBindings,
  getOntologyPackSample,
  listOntologies,
  listOntologyAxioms,
  listOntologyConcepts,
  listOntologyPacks,
  listOntologyProperties,
  listOntologyReleases,
} from './ontology';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('ontology API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists ontologies from GET /v1/ontologies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'o1',
              name: 'sales-ontology',
              displayName: 'Sales Ontology',
              fullyQualifiedName: 'sales-ontology',
              iri: 'https://example.com/sales',
              namespace: 'https://example.com/sales#',
              publicationStatus: 'Published',
              owners: [{ name: 'alice' }],
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listOntologies({ limit: 100 });
    expect(lastFetch().url).toContain('/api/v1/ontologies');
    expect(page.data[0]?.displayName).toBe('Sales Ontology');
    expect(page.data[0]?.publicationStatus).toBe('Published');
    expect(page.data[0]?.owners[0]?.name).toBe('alice');
  });

  it('gets one ontology with owners,reviewers fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ id: 'o1', name: 'sales-ontology', reviewers: [{ name: 'bob' }] }),
      ),
    );
    const ontology = await getOntology('o1');
    expect(lastFetch().url).toContain('/api/v1/ontologies/o1');
    expect(lastFetch().url).toContain('fields=owners');
    expect(ontology.reviewers[0]?.name).toBe('bob');
  });

  it('creates an ontology with the official required name + iri + namespace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: 'sales-ontology',
          iri: 'https://example.com/sales',
          namespace: 'https://example.com/sales#',
        });
        return jsonResponse({ id: 'o1', name: 'sales-ontology' });
      }),
    );
    const created = await createOntology({
      name: 'sales-ontology',
      iri: 'https://example.com/sales',
      namespace: 'https://example.com/sales#',
    });
    expect(created.id).toBe('o1');
  });

  it('lists concepts filtered by ontology fqn with the studio fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'c1',
              name: 'Customer',
              conceptType: 'Class',
              iri: 'https://example.com/sales#Customer',
              lifecycleStatus: 'Active',
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listOntologyConcepts({ ontology: 'sales-ontology', limit: 50 });
    expect(lastFetch().url).toContain('/api/v1/ontologyConcepts');
    expect(lastFetch().url).toContain('ontology=sales-ontology');
    expect(lastFetch().url).toContain('fields=');
    expect(page.data[0]?.conceptType).toBe('Class');
  });

  it('lists properties filtered by ontology fqn', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ id: 'p1', name: 'hasOrder', kind: 'ObjectProperty', range: 'Order' }],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listOntologyProperties({ ontology: 'sales-ontology', limit: 50 });
    expect(lastFetch().url).toContain('/api/v1/ontologyProperties');
    expect(lastFetch().url).toContain('ontology=sales-ontology');
    expect(page.data[0]?.range).toBe('Order');
  });

  it('gets a concept by id from GET /v1/ontologyConcepts/{id}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'c1',
          name: 'Customer',
          synonyms: ['Buyer'],
          superClasses: [{ id: 'c0', name: 'Party', type: 'ontologyConcept' }],
        }),
      ),
    );
    const concept = await getOntologyConcept('c1');
    expect(lastFetch().url).toContain('/api/v1/ontologyConcepts/c1');
    expect(concept.synonyms).toEqual(['Buyer']);
    expect(concept.superClasses?.[0]?.name).toBe('Party');
  });

  it('lists axioms by ontology id from GET /v1/ontologyAxioms', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ id: 'ax1', name: 'CustomerSubClassOfParty', axiomType: 'SubClassOf' }],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listOntologyAxioms({ ontologyId: 'o1' });
    expect(lastFetch().url).toContain('/api/v1/ontologyAxioms');
    expect(lastFetch().url).toContain('ontologyId=o1');
    expect(page.data[0]?.axiomType).toBe('SubClassOf');
  });

  it('keeps structured axiom expressions and the deleted flag for the model graph', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'ax1',
              name: 'CustomerSubClassOfParty',
              axiomType: 'SUBCLASS_OF',
              subjectIri: 'https://example.com/sales#Customer',
              expressions: [
                'plain-string',
                { kind: 'NAMED_CLASS', classIri: 'https://example.com/sales#Party' },
                {
                  kind: 'RESTRICTION',
                  propertyIri: 'https://example.com/sales#hasOrder',
                  restrictionKind: 'SOME',
                  filler: { kind: 'NAMED_CLASS', classIri: 'https://example.com/sales#Order' },
                },
              ],
              deleted: true,
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listOntologyAxioms({ ontologyId: 'o1' });
    const axiom = page.data[0];
    expect(axiom?.expressions).toEqual(['plain-string']);
    expect(axiom?.structuredExpressions).toEqual([
      { kind: 'NAMED_CLASS', classIri: 'https://example.com/sales#Party' },
      {
        kind: 'RESTRICTION',
        propertyIri: 'https://example.com/sales#hasOrder',
        restrictionKind: 'SOME',
        filler: { kind: 'NAMED_CLASS', classIri: 'https://example.com/sales#Order' },
      },
    ]);
    expect(axiom?.deleted).toBe(true);
  });

  it('maps property domain/range IRI arrays and lone strings alike', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'p1',
              name: 'hasOrder',
              kind: 'OBJECT',
              domain: ['https://example.com/sales#Customer'],
              range: ['https://example.com/sales#Order'],
            },
            { id: 'p2', name: 'age', kind: 'DATA', domain: 'https://example.com/sales#Customer' },
          ],
          paging: { total: 2 },
        }),
      ),
    );
    const page = await listOntologyProperties({ ontology: 'sales-ontology', limit: 50 });
    expect(page.data[0]?.domainIris).toEqual(['https://example.com/sales#Customer']);
    expect(page.data[0]?.rangeIris).toEqual(['https://example.com/sales#Order']);
    expect(page.data[1]?.domainIris).toEqual(['https://example.com/sales#Customer']);
    expect(page.data[1]?.rangeIris).toBeUndefined();
  });

  it('lists sealed releases by ontology id from GET /v1/ontologyReleases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ id: 'r1', name: 'sales-1.0', semanticVersion: '1.0.0', memberCount: 12 }],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listOntologyReleases({ ontologyId: 'o1' });
    expect(lastFetch().url).toContain('/api/v1/ontologyReleases');
    expect(page.data[0]?.semanticVersion).toBe('1.0.0');
  });

  it('lists library packs from GET /v1/ontologyPacks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          packs: [{ name: 'fibo', standard: 'FIBO', modules: [{ name: 'core', conceptCount: 10 }] }],
          installations: [],
        }),
      ),
    );
    const packs = await listOntologyPacks();
    expect(lastFetch().url).toContain('/api/v1/ontologyPacks');
    expect(packs[0]?.modules[0]?.conceptCount).toBe(10);
  });

  it('samples a pack from GET /v1/ontologyPacks/{packId}/sample', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ packId: 'fibo', conceptCount: 2, relationCount: 1, concepts: [{ name: 'Party' }] }),
      ),
    );
    const sample = await getOntologyPackSample('fibo', ['core']);
    expect(lastFetch().url).toContain('/api/v1/ontologyPacks/fibo/sample');
    expect(lastFetch().url).toContain('moduleIds=core');
    expect(sample.concepts[0]?.name).toBe('Party');
  });

  it('gets concept bindings from GET /v1/ontologyConcepts/{id}/bindings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          assets: [
            {
              assetType: 'table',
              assetId: 't1',
              asset: { id: 't1', name: 'orders', type: 'table' },
              columns: [{ propertyId: 'p1', columnPath: 'orders.id', state: 'resolved' }],
            },
          ],
        }),
      ),
    );
    const bindings = await getOntologyConceptBindings('c1');
    expect(lastFetch().url).toContain('/api/v1/ontologyConcepts/c1/bindings');
    expect(bindings.assets[0]?.columnCount).toBe(1);
  });
});
