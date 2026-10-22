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
import { createGlossaryTerm, getGlossaryTerm, listGlossaryTermAssets, listGlossaryTerms } from './glossaryTerms';

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
});
