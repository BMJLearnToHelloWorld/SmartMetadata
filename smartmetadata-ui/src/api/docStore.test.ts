/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  createDocument,
  emptyPersonaDocument,
  getDocumentByFqn,
  personaDocFqn,
  savePersonaDocument,
  updateDocument,
} from './docStore';
import type { PersonaDocument } from '@/types/persona';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const storedDoc: PersonaDocument = {
  id: 'doc1',
  name: 'Analyst-Analyst',
  fullyQualifiedName: 'persona.Analyst',
  entityType: 'Page',
  data: {
    pages: [{ pageType: 'LandingPage', layout: { widgets: [] } }],
    personaPreferences: [{ personaId: 'p1', personaName: 'Analyst' }],
  },
};

describe('docStore API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('derives the persona document FQN and guards empty input', () => {
    expect(personaDocFqn('Analyst')).toBe('persona.Analyst');
    expect(personaDocFqn()).toBeNull();
    expect(personaDocFqn('')).toBeNull();
  });

  it('builds the official empty-document template', () => {
    const doc = emptyPersonaDocument('Analyst', 'Analyst');
    expect(doc.fullyQualifiedName).toBe('persona.Analyst');
    expect(doc.name).toBe('Analyst-Analyst');
    expect(doc.entityType).toBe('Page');
    expect(doc.data.pages).toEqual([]);
    expect(doc.id).toBeUndefined();
  });

  it('fetches a document by FQN from GET /v1/docStore/name/{fqn}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      id: 'doc1',
      name: 'Analyst-Analyst',
      fullyQualifiedName: 'persona.Analyst',
      entityType: 'Page',
      data: { pages: [{ pageType: 'LandingPage', layout: {} }], personaPreferences: [] },
    })));
    const doc = await getDocumentByFqn('persona.Analyst');
    expect(doc.id).toBe('doc1');
    expect(doc.data.pages?.[0]?.pageType).toBe('LandingPage');
    expect(lastFetch().url).toContain('/api/v1/docStore/name/persona.Analyst');
  });

  it('saves an existing document with a pages replace patch only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...storedDoc })));
    const saved = await savePersonaDocument(storedDoc, (draft) => {
      draft.data.pages = [{ pageType: 'DataMarketplace', layout: { widgets: ['a'] } }];
    });
    expect(saved.id).toBe('doc1');
    expect(lastFetch().init?.method).toBe('PATCH');
    const body = JSON.parse(String(lastFetch().init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        op: 'replace',
        path: '/data/pages',
        value: [{ pageType: 'DataMarketplace', layout: { widgets: ['a'] } }],
      },
    ]);
  });

  it('does not call the server when nothing changed', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ...storedDoc }));
    vi.stubGlobal('fetch', fetchMock);
    const saved = await savePersonaDocument(storedDoc, () => undefined);
    expect(saved).toBe(storedDoc);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a document without id, mapping domains to FQNs', async () => {
    const draft = emptyPersonaDocument('Analyst', 'Analyst');
    draft.domains = [{ id: 'd1', name: 'Marketing', fullyQualifiedName: 'Marketing', type: 'domain' }];
    draft.data.pages = [{ pageType: 'LandingPage', layout: {} }];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...draft, id: 'doc9' })));
    const saved = await savePersonaDocument(draft, () => undefined);
    expect(saved.id).toBe('doc9');
    expect(lastFetch().init?.method).toBe('POST');
    expect(String(lastFetch().init?.body)).toContain('"domains":["Marketing"]');
  });

  it('updates a document with an explicit JSON Patch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...storedDoc })));
    await updateDocument('doc1', [{ op: 'replace', path: '/data/pages', value: [] }]);
    expect(lastFetch().url).toContain('/api/v1/docStore/doc1');
    expect(lastFetch().init?.method).toBe('PATCH');
  });

  it('creates a document with POST /v1/docStore', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...storedDoc, id: 'doc9' })));
    const saved = await createDocument({
      name: 'Analyst-Analyst',
      fullyQualifiedName: 'persona.Analyst',
      entityType: 'Page',
      data: { pages: [] },
    });
    expect(saved.id).toBe('doc9');
    expect(lastFetch().url).toContain('/api/v1/docStore');
    expect(lastFetch().init?.method).toBe('POST');
  });
});
