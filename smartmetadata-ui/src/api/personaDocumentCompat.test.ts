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
  normalizePersonaDocument,
  updatePersonaDocumentPage,
} from '@/views/admin/personaPage';
import {
  emptyPersonaDocument,
  getDocumentByFqn,
  savePersonaDocument,
} from './docStore';
import {
  entriesWithoutPageTypePayload,
  legacyDocumentPayload,
  objectLayoutPayload,
  singlePageArrayLayoutPayload,
} from './personaDocument.fixtures';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Minimal fake DocStore: GET returns the held document, PATCH applies
 * whole-key ops to `data`, POST stores the created body. Enough to
 * prove load → modify → save → re-read round-trips without inventing
 * server behaviour beyond key-level JSON Patch application.
 */
function fakeDocServer(initial: Record<string, unknown>) {
  let state: Record<string, unknown> = JSON.parse(JSON.stringify(initial)) as Record<string, unknown>;
  const requests: Array<{ method?: string; body?: string }> = [];
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method;
    const body = typeof init?.body === 'string' ? init.body : undefined;
    requests.push({ method, body });
    if (method === 'PATCH' && body) {
      const data = (state.data ?? {}) as Record<string, unknown>;
      for (const op of JSON.parse(body) as Array<Record<string, unknown>>) {
        const key = String(op.path).replace('/data/', '');
        if (op.op === 'remove') {
          delete data[key];
        } else {
          data[key] = op.value;
        }
      }
      return jsonResponse(state);
    }
    if (body && method !== 'GET') {
      state = { ...(JSON.parse(body) as Record<string, unknown>), id: 'doc-new' };
      return jsonResponse(state);
    }
    return jsonResponse(state);
  });
  return {
    fetchMock,
    requests,
    get state() {
      return state;
    },
  };
}

function patchBodies(requests: Array<{ method?: string; body?: string }>) {
  return requests
    .filter((request) => request.method === 'PATCH' && request.body)
    .map((request) => JSON.parse(request.body as string) as Array<Record<string, unknown>>);
}

describe('persona document compatibility round-trips (C-4 §4.3)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('retains Tag/Classification entries when another page is saved and re-read', async () => {
    const server = fakeDocServer(legacyDocumentPayload());
    vi.stubGlobal('fetch', server.fetchMock);
    const doc = normalizePersonaDocument(await getDocumentByFqn('persona.Analyst'));
    expect(doc.data.pages?.map((page) => page.pageType)).toEqual([
      'Tag',
      'Classification',
      'Table',
    ]);
    const tagEntry = doc.data.pages?.[0];
    const classificationEntry = doc.data.pages?.[1];
    await savePersonaDocument(doc, (draft) => {
      const updated = updatePersonaDocumentPage(draft, 'Table', {
        pageType: 'Table',
        entityType: 'table',
        layout: [{ i: 'w-table-new', x: 0, y: 0, w: 8, h: 1 }],
      });
      draft.data.pages = updated.data.pages;
    });
    const [patch] = patchBodies(server.requests);
    const writtenPages = patch?.find((op) => op.path === '/data/pages')?.value as Array<
      Record<string, unknown>
    >;
    expect(writtenPages?.[0]).toEqual(JSON.parse(JSON.stringify(tagEntry)));
    expect(writtenPages?.[1]).toEqual(JSON.parse(JSON.stringify(classificationEntry)));
    const reread = await getDocumentByFqn('persona.Analyst');
    expect(reread.data.pages?.map((page) => page.pageType)).toEqual([
      'Tag',
      'Classification',
      'Table',
    ]);
  });

  it('retains unknown data keys and unedited page fields through a save', async () => {
    const server = fakeDocServer(legacyDocumentPayload());
    vi.stubGlobal('fetch', server.fetchMock);
    const doc = await getDocumentByFqn('persona.Analyst');
    await savePersonaDocument(doc, (draft) => {
      draft.data.personaPreferences = [{ personaId: 'p1', personaName: 'Analyst' }];
    });
    const [patch] = patchBodies(server.requests);
    expect(patch?.map((op) => op.path)).toEqual(['/data/personaPreferences']);
    const data = server.state.data as Record<string, unknown>;
    expect(data.futureDataKey).toEqual({ kept: true });
    expect(data.askCollateSidebar).toEqual([{ key: 'ai-home' }]);
    const pages = data.pages as Array<Record<string, unknown>>;
    expect(pages[2]?.futurePageField).toBe('kept');
    expect(pages[2]?.persona).toEqual({ id: 'p1', type: 'persona', name: 'Analyst' });
    const reread = await getDocumentByFqn('persona.Analyst');
    expect(reread.data.futureDataKey).toEqual({ kept: true });
    expect(reread.data.pages?.[2]?.futurePageField).toBe('kept');
  });

  it('keeps navigation and askCollateSidebar on a page save; a navigation save touches only navigation', async () => {
    const server = fakeDocServer(legacyDocumentPayload());
    vi.stubGlobal('fetch', server.fetchMock);
    const doc = await getDocumentByFqn('persona.Analyst');
    await savePersonaDocument(doc, (draft) => {
      const updated = updatePersonaDocumentPage(draft, 'Table', {
        pageType: 'Table',
        layout: [],
      });
      draft.data.pages = updated.data.pages;
    });
    const [pagePatch] = patchBodies(server.requests);
    expect(pagePatch?.map((op) => op.path)).toEqual(['/data/pages']);
    expect((server.state.data as Record<string, unknown>).navigation).toEqual([{ key: 'home' }]);
    expect((server.state.data as Record<string, unknown>).askCollateSidebar).toEqual([
      { key: 'ai-home' },
    ]);
    const reloaded = await getDocumentByFqn('persona.Analyst');
    await savePersonaDocument(reloaded, (draft) => {
      draft.data.navigation = [{ key: 'home' }, { key: 'search' }];
    });
    const [, navigationPatch] = patchBodies(server.requests);
    expect(navigationPatch).toEqual([
      {
        op: 'replace',
        path: '/data/navigation',
        value: [
          { key: 'home' },
          { key: 'search' },
        ],
      },
    ]);
    expect((server.state.data as Record<string, unknown>).askCollateSidebar).toEqual([
      { key: 'ai-home' },
    ]);
  });

  it.each([{}, { widgets: ['a'], nested: { deep: true } }])(
    'preserves an object-shaped layout (%j): no silent overwrite, conversion only by an explicit new page',
    async (layout) => {
      const server = fakeDocServer(objectLayoutPayload(layout));
      vi.stubGlobal('fetch', server.fetchMock);
      const doc = await getDocumentByFqn('persona.Analyst');
      expect(doc.data.pages?.[0]?.layout).toEqual(layout);
      await savePersonaDocument(doc, (draft) => {
        draft.data.personaPreferences = [{ personaId: 'p1' }];
      });
      const [patch] = patchBodies(server.requests);
      expect(patch?.map((op) => op.path)).toEqual(['/data/personaPreferences']);
      const pages = (server.state.data as Record<string, unknown>).pages as Array<
        Record<string, unknown>
      >;
      expect(pages[0]?.layout).toEqual(layout);
      const reloaded = await getDocumentByFqn('persona.Analyst');
      await savePersonaDocument(reloaded, (draft) => {
        const updated = updatePersonaDocumentPage(draft, 'LandingPage', {
          pageType: 'LandingPage',
          layout: [{ i: 'w1', x: 0, y: 0, w: 1, h: 3 }],
        });
        draft.data.pages = updated.data.pages;
      });
      const [, replacePatch] = patchBodies(server.requests);
      const writtenPages = replacePatch?.find((op) => op.path === '/data/pages')?.value as Array<
        Record<string, unknown>
      >;
      expect(writtenPages?.[0]?.layout).toEqual([{ i: 'w1', x: 0, y: 0, w: 1, h: 3 }]);
    },
  );

  it('round-trips a normal array layout: modify, save, re-read', async () => {
    const server = fakeDocServer(singlePageArrayLayoutPayload());
    vi.stubGlobal('fetch', server.fetchMock);
    const doc = await getDocumentByFqn('persona.Analyst');
    const saved = await savePersonaDocument(doc, (draft) => {
      const updated = updatePersonaDocumentPage(draft, 'LandingPage', {
        pageType: 'LandingPage',
        layout: [{ i: 'w2', x: 0, y: 0, w: 1, h: 3 }],
      });
      draft.data.pages = updated.data.pages;
    });
    expect(saved.data.pages?.[0]?.layout).toEqual([{ i: 'w2', x: 0, y: 0, w: 1, h: 3 }]);
    const reread = await getDocumentByFqn('persona.Analyst');
    expect(reread.data.pages?.[0]?.layout).toEqual([{ i: 'w2', x: 0, y: 0, w: 1, h: 3 }]);
  });

  it('creates from the empty template when no document exists (404)', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH' || (init?.body && init?.method !== 'GET')) {
        return jsonResponse({ ...(JSON.parse(String(init.body)) as object), id: 'doc-new' });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getDocumentByFqn('persona.Analyst')).rejects.toMatchObject({ status: 404 });
    const draft = emptyPersonaDocument('Analyst', 'Analyst');
    draft.domains = [
      { id: 'd1', name: 'Marketing', fullyQualifiedName: 'Marketing', type: 'domain' },
    ];
    const saved = await savePersonaDocument(draft, (mutated) => {
      mutated.data.pages = [{ pageType: 'LandingPage', layout: [] }];
    });
    expect(saved.id).toBe('doc-new');
    const createCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')
      ?? fetchMock.mock.calls.at(-1);
    const body = JSON.parse(String(createCall?.[1]?.body)) as Record<string, unknown>;
    expect(body.fullyQualifiedName).toBe('persona.Analyst');
    expect(body.domains).toEqual(['Marketing']);
    expect(body.data).toEqual({
      pages: [{ pageType: 'LandingPage', layout: [] }],
      navigation: null,
    });
  });

  it('filters entries without a string pageType on load and never writes them back', async () => {
    const server = fakeDocServer(entriesWithoutPageTypePayload());
    vi.stubGlobal('fetch', server.fetchMock);
    const doc = normalizePersonaDocument(await getDocumentByFqn('persona.Analyst'));
    expect(doc.data.pages).toHaveLength(1);
    expect(doc.data.pages?.[0]?.pageType).toBe('LandingPage');
    await savePersonaDocument(doc, (draft) => {
      draft.data.personaPreferences = [{ personaId: 'p1' }];
    });
    const [patch] = patchBodies(server.requests);
    expect(patch?.map((op) => op.path)).toEqual(['/data/personaPreferences']);
  });
});
