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

  it('keeps an array page layout verbatim through mapping (B3-6 reader source)', async () => {
    const layout = [
      { i: 'KnowledgePanel.MarketplaceDomains', y: 0 },
      { i: 'KnowledgePanel.MarketplaceDataProducts', y: 1 },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      id: 'doc1',
      name: 'Analyst-Analyst',
      fullyQualifiedName: 'persona.Analyst',
      entityType: 'Page',
      data: { pages: [{ pageType: 'DataMarketplace', layout }], personaPreferences: [] },
    })));
    const doc = await getDocumentByFqn('persona.Analyst');
    expect(doc.data.pages?.[0]?.layout).toEqual(layout);
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

  it('maps personPreferences through a read, header colour included (stage D round-trip)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      id: 'doc1',
      name: 'Analyst-Analyst',
      fullyQualifiedName: 'persona.Analyst',
      entityType: 'Page',
      data: {
        pages: [{ pageType: 'LandingPage', layout: [] }],
        personaPreferences: [{ personaId: 'p1', landingPageSettings: { headerColor: '#1570EF' } }],
        personPreferences: [{ personaId: 'p1', landingPageSettings: { headerColor: '#099250' } }],
      },
    })));
    const doc = await getDocumentByFqn('persona.Analyst');
    expect(doc.data.personaPreferences?.[0]?.landingPageSettings?.headerColor).toBe('#1570EF');
    expect(doc.data.personPreferences?.[0]?.landingPageSettings?.headerColor).toBe('#099250');
  });

  it('saves a personPreferences change with a personPreferences add patch (path was absent)', async () => {
    // C-4 §3.3 defect 2: storedDoc carries no personPreferences key, so
    // the op is `add`, not the previous unconditional `replace`. The
    // missing-path trigger condition itself is unconfirmed; the op
    // choice follows key presence, as the official compare does.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...storedDoc })));
    const saved = await savePersonaDocument(storedDoc, (draft) => {
      draft.data.personPreferences = [
        { personaId: 'p1', landingPageSettings: { headerColor: '#099250' } },
      ];
    });
    expect(saved.id).toBe('doc1');
    expect(lastFetch().init?.method).toBe('PATCH');
    const body = JSON.parse(String(lastFetch().init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        op: 'add',
        path: '/data/personPreferences',
        value: [{ personaId: 'p1', landingPageSettings: { headerColor: '#099250' } }],
      },
    ]);
  });

  it('replaces a present personaPreferences path and adds an absent navigation path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...storedDoc })));
    await savePersonaDocument(storedDoc, (draft) => {
      draft.data.personaPreferences = [{ personaId: 'p1', personaName: 'Analyst', appMode: 'AI' }];
    });
    const body = JSON.parse(String(lastFetch().init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        op: 'replace',
        path: '/data/personaPreferences',
        value: [{ personaId: 'p1', personaName: 'Analyst', appMode: 'AI' }],
      },
    ]);
    await savePersonaDocument(storedDoc, (draft) => {
      draft.data.navigation = [{ key: 'home' }];
    });
    const added = JSON.parse(String(lastFetch().init?.body)) as Array<Record<string, unknown>>;
    expect(added).toEqual([
      { op: 'add', path: '/data/navigation', value: [{ key: 'home' }] },
    ]);
  });

  it('emits a navigation op when only navigation changes (C-4 defect 1)', async () => {
    const withNavigation: PersonaDocument = {
      ...storedDoc,
      data: { ...storedDoc.data, navigation: [{ key: 'home' }] },
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...withNavigation })));
    await savePersonaDocument(withNavigation, (draft) => {
      draft.data.navigation = [{ key: 'home' }, { key: 'search' }];
    });
    expect(lastFetch().init?.method).toBe('PATCH');
    const body = JSON.parse(String(lastFetch().init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        op: 'replace',
        path: '/data/navigation',
        value: [{ key: 'home' }, { key: 'search' }],
      },
    ]);
  });

  it('leaves untouched data keys out of the patch and removes a deleted key', async () => {
    const withExtra: PersonaDocument = {
      ...storedDoc,
      data: {
        ...storedDoc.data,
        navigation: [{ key: 'home' }],
        askCollateSidebar: [{ key: 'ai-home' }],
        futureKey: { kept: true },
      },
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...withExtra })));
    await savePersonaDocument(withExtra, (draft) => {
      draft.data.pages = [{ pageType: 'Table', layout: [] }];
    });
    const body = JSON.parse(String(lastFetch().init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      { op: 'replace', path: '/data/pages', value: [{ pageType: 'Table', layout: [] }] },
    ]);
    await savePersonaDocument(withExtra, (draft) => {
      delete draft.data.navigation;
    });
    const removed = JSON.parse(String(lastFetch().init?.body)) as Array<Record<string, unknown>>;
    expect(removed).toEqual([{ op: 'remove', path: '/data/navigation' }]);
  });

  it('keeps every stored data key and page field verbatim through mapping (RB-8)', async () => {
    const payload = {
      id: 'doc1',
      name: 'Analyst-Analyst',
      fullyQualifiedName: 'persona.Analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'Table',
            entityType: 'table',
            layout: [{ i: 'w1', x: 0, y: 0, w: 8, h: 1 }],
            knowledgePanels: [
              {
                id: 'kp1',
                type: 'knowledgePanel',
                name: 'Panel',
                fullyQualifiedName: 'Panel',
                description: 'desc',
                deleted: false,
                inherited: true,
                href: '/api/v1/docStore/kp1',
                futureSubfield: 'kept',
              },
            ],
            tabs: [{ id: 't1', name: 'Overview', layout: [] }],
            persona: { id: 'p1', type: 'persona', name: 'Analyst', description: 'pdesc' },
            domains: [{ id: 'd1', type: 'domain', name: 'Marketing', deleted: true }],
            futurePageField: { nested: [1, 2] },
          },
        ],
        personaPreferences: [
          {
            personaId: 'p1',
            appMode: 'classic',
            landingPageSettings: { headerColor: '#099250', futureSetting: 'kept' },
            futurePrefField: 42,
          },
        ],
        navigation: [{ key: 'home' }],
        askCollateSidebar: [{ key: 'ai-home' }],
        futureDataKey: { anything: ['goes'] },
      },
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload)));
    const doc = await getDocumentByFqn('persona.Analyst');
    expect(doc.data.askCollateSidebar).toEqual([{ key: 'ai-home' }]);
    expect(doc.data.futureDataKey).toEqual({ anything: ['goes'] });
    expect(doc.data.navigation).toEqual([{ key: 'home' }]);
    expect('personPreferences' in doc.data).toBe(false);
    const page = doc.data.pages?.[0];
    expect(page?.persona).toEqual({
      id: 'p1',
      type: 'persona',
      name: 'Analyst',
      description: 'pdesc',
    });
    expect(page?.domains).toEqual([{ id: 'd1', type: 'domain', name: 'Marketing', deleted: true }]);
    expect(page?.knowledgePanels).toEqual([
      {
        id: 'kp1',
        type: 'knowledgePanel',
        name: 'Panel',
        fullyQualifiedName: 'Panel',
        description: 'desc',
        deleted: false,
        inherited: true,
        href: '/api/v1/docStore/kp1',
        futureSubfield: 'kept',
      },
    ]);
    expect(page?.futurePageField).toEqual({ nested: [1, 2] });
    const pref = doc.data.personaPreferences?.[0];
    expect(pref?.landingPageSettings).toEqual({ headerColor: '#099250', futureSetting: 'kept' });
    expect(pref?.futurePrefField).toBe(42);
  });

  it('keeps object-shaped layouts verbatim through mapping, empty and non-empty', async () => {
    for (const layout of [{}, { widgets: ['a'], nested: { deep: true } }]) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
        id: 'doc1',
        name: 'Analyst-Analyst',
        fullyQualifiedName: 'persona.Analyst',
        entityType: 'Page',
        data: { pages: [{ pageType: 'LandingPage', layout }] },
      })));
      const doc = await getDocumentByFqn('persona.Analyst');
      expect(doc.data.pages?.[0]?.layout).toEqual(layout);
    }
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
