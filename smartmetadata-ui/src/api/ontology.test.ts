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
  listOntologies,
  listOntologyConcepts,
  listOntologyProperties,
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
});
