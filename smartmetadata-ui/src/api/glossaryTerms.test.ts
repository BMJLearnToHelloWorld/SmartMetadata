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
import { createGlossaryTerm, getGlossaryTerm, getGlossaryTermsByIds, listGlossaryTermAssets, listGlossaryTermChildrenLazy, listGlossaryTerms } from './glossaryTerms';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('glossaryTerms API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists terms filtered by glossary id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 't1',
                name: 'Customer',
                fullyQualifiedName: 'Business.Customer',
                glossary: { id: 'g1', name: 'Business', type: 'glossary' },
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listGlossaryTerms({ glossary: 'g1', limit: 50 });
    expect(page.data[0]?.name).toBe('Customer');
    expect(lastFetch().url).toContain('/api/v1/glossaryTerms');
    expect(lastFetch().url).toContain('glossary=g1');
  });

  it('drops empty children so childless terms draw no expand icon, and keeps loaded children with descriptions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 't1',
                name: 'Customer',
                fullyQualifiedName: 'Business.Customer',
                children: [],
                childrenCount: 0,
              },
              {
                id: 't2',
                name: 'Order',
                fullyQualifiedName: 'Business.Order',
                children: [
                  {
                    id: 't3',
                    name: 'LineItem',
                    fullyQualifiedName: 'Business.Order.LineItem',
                    description: 'One line on an order',
                    type: 'glossaryTerm',
                  },
                ],
                childrenCount: 1,
              },
            ],
            paging: { total: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listGlossaryTerms({ glossary: 'g1', limit: 50 });
    expect(page.data[0]?.children).toBeUndefined();
    expect(page.data[1]?.children).toHaveLength(1);
    expect(page.data[1]?.children?.[0]).toMatchObject({
      name: 'LineItem',
      description: 'One line on an order',
    });
    expect(page.data[1]?.childrenCount).toBe(1);
  });

  it('creates a term with glossary FQN, name, and description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          glossary: 'Business',
          name: 'Revenue',
          description: 'Recognized revenue',
        });
        return new Response(
          JSON.stringify({ id: 't2', name: 'Revenue', glossary: { name: 'Business', type: 'glossary' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const created = await createGlossaryTerm({
      glossary: 'Business',
      name: 'Revenue',
      description: 'Recognized revenue',
    });
    expect(created.id).toBe('t2');
    expect(lastFetch().init?.method).toBe('POST');
    expect(lastFetch().url).toContain('/api/v1/glossaryTerms');
  });

  it('loads related terms from TermRelation objects on GET', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 't1',
            name: 'Customer',
            relatedTerms: [
              {
                relationType: 'relatedTo',
                term: { id: 't9', name: 'Account', type: 'glossaryTerm', fullyQualifiedName: 'Business.Account' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const term = await getGlossaryTerm('t1');
    expect(term.relatedTerms[0]).toMatchObject({
      id: 't9',
      name: 'Account',
      fullyQualifiedName: 'Business.Account',
    });
    expect(lastFetch().url).toContain('/api/v1/glossaryTerms/t1');
  });

  it('lists tagged assets from GET /v1/glossaryTerms/{id}/assets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'a1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listGlossaryTermAssets('t1');
    expect(page.data[0]?.fullyQualifiedName).toBe('svc.db.schema.orders');
    expect(lastFetch().url).toContain('/api/v1/glossaryTerms/t1/assets');
  });

  it('lazy-loads direct children with directChildrenOf, full fields, and the after cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'c1',
                name: 'Retail',
                fullyQualifiedName: 'Business.Customer.Retail',
                entityStatus: 'Approved',
                owners: [{ id: 'u1', name: 'amy', type: 'user' }],
                childrenCount: 0,
              },
            ],
            paging: { total: 2, after: 'c1' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listGlossaryTermChildrenLazy('Business.Customer', 50, 'c0');
    expect(page.data[0]?.status).toBe('Approved');
    expect(page.data[0]?.owners).toHaveLength(1);
    expect(page.after).toBe('c1');
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/glossaryTerms');
    expect(url).toContain(`directChildrenOf=${encodeURIComponent('Business.Customer')}`);
    expect(url).toContain('after=c0');
    expect(url).toContain('limit=50');
  });

  it('hydrates terms by ids and keeps the TermRelation relationType (M-Next A3)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              id: 'x1',
              name: 'External',
              fullyQualifiedName: 'Other.External',
              relatedTerms: [
                { term: { id: 'a', name: 'A', type: 'glossaryTerm' }, relationType: 'broader' },
              ],
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const terms = await getGlossaryTermsByIds(['x1']);
    expect(terms).toHaveLength(1);
    expect(lastFetch().url).toContain('/api/v1/glossaryTerms/byIds');
    expect(lastFetch().url).toContain('ids=x1');
    expect(terms[0]?.relatedTerms).toEqual([
      { id: 'a', name: 'A', type: 'glossaryTerm', relationType: 'broader' },
    ]);
    await expect(getGlossaryTermsByIds([])).resolves.toEqual([]);
  });
});
