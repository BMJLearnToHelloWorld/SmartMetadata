/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { useAuthStore } from '@/stores/auth';
import { PERSONA_STORAGE_KEY, usePersonaStore } from './persona';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('persona store', () => {
  beforeEach(() => {
    // The store persists in sessionStorage (pin); localStorage holds
    // only the one-time legacy seed, so both must be cleared for a
    // hermetic test — a leftover session value would otherwise make
    // the fallback test pass for the wrong reason.
    localStorage.clear();
    sessionStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('selects the stored persona and persists a new selection', async () => {
    localStorage.setItem(PERSONA_STORAGE_KEY, 'p1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/personas')) {
        return jsonResponse({
          data: [
            { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' },
            { id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward' },
          ],
          paging: { total: 2 },
        });
      }
      return jsonResponse({});
    }));
    const store = usePersonaStore();
    await store.ensureLoaded();
    expect(store.selectedPersona?.id).toBe('p1');
    await store.selectPersona('p2');
    // 2026-11-25 nav-domain-persona: the selection persists in
    // sessionStorage (pin), not localStorage; the legacy localStorage
    // seed was adopted into sessionStorage and cleared at hydrate.
    expect(sessionStorage.getItem(PERSONA_STORAGE_KEY)).toBe('p2');
    expect(localStorage.getItem(PERSONA_STORAGE_KEY)).toBeNull();
    expect(store.selectedPersona?.id).toBe('p2');
  });

  it('falls back to the user default persona when nothing is stored', async () => {
    useAuthStore().user = {
      id: 'u1',
      name: 'ada',
      defaultPersona: { id: 'p2', name: 'Steward', type: 'persona' },
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [
        { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' },
        { id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward' },
      ],
      paging: { total: 2 },
    })));
    const store = usePersonaStore();
    await store.ensureLoaded();
    expect(store.selectedPersona?.id).toBe('p2');
  });

  it('drops a stored id that no longer exists', async () => {
    localStorage.setItem(PERSONA_STORAGE_KEY, 'gone');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
      paging: { total: 1 },
    })));
    const store = usePersonaStore();
    await store.ensureLoaded();
    expect(store.selectedPersona).toBeNull();
    // The dropped id must not linger in either storage: the legacy
    // seed was adopted and cleared at hydrate, and persist() removes
    // the session key when there is no selection.
    expect(localStorage.getItem(PERSONA_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(PERSONA_STORAGE_KEY)).toBeNull();
  });

  it('loads and normalizes the selected persona document, tolerating 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/personas')) {
        return jsonResponse({
          data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
          paging: { total: 1 },
        });
      }
      if (url.includes('/v1/docStore/name/persona.Analyst')) {
        return jsonResponse({
          name: 'Analyst-Analyst',
          fullyQualifiedName: 'persona.Analyst',
          entityType: 'Page',
          data: {
            pages: [{ pageType: 'LandingPage', layout: {} }, { layout: {} }],
            personaPreferences: [],
          },
        });
      }
      return new Response('Not found', { status: 404 });
    }));
    const store = usePersonaStore();
    await store.ensureLoaded();
    await store.selectPersona('p1');
    expect(store.document?.data.pages).toHaveLength(1);
    expect(store.document?.data.pages?.[0]?.pageType).toBe('LandingPage');
  });

  it('treats a missing document as no customizations, not an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({
            data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
            paging: { total: 1 },
          });
        }
        return new Response('Not found', { status: 404 });
      }));
      const store = usePersonaStore();
      await store.ensureLoaded();
      await store.selectPersona('p1');
      expect(store.document).toBeNull();
      expect(store.documentLoaded).toBe(true);
      expect(store.documentError).toBeNull();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs a non-404 document read failure instead of swallowing it silently', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({
            data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
            paging: { total: 1 },
          });
        }
        return new Response('Server error', { status: 500 });
      }));
      const store = usePersonaStore();
      await store.ensureLoaded();
      await store.selectPersona('p1');
      expect(store.document).toBeNull();
      expect(store.documentLoaded).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('records a non-404 document read failure as documentError (D-9), cleared by success', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let failDoc = true;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({
            data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
            paging: { total: 1 },
          });
        }
        if (failDoc) {
          return new Response('Server error', { status: 500 });
        }
        return jsonResponse({
          name: 'Analyst-Analyst',
          fullyQualifiedName: 'persona.Analyst',
          entityType: 'Page',
          data: { pages: [{ pageType: 'LandingPage', layout: [] }] },
        });
      }));
      const store = usePersonaStore();
      await store.ensureLoaded();
      await store.selectPersona('p1');
      expect(store.document).toBeNull();
      expect(store.documentError).toBeTruthy();
      failDoc = false;
      await store.loadDocument();
      expect(store.documentError).toBeNull();
      expect(store.document?.data.pages).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('loads a page document without switching the global selection or slot (C-4 §3.2③)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/personas')) {
        return jsonResponse({
          data: [
            { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' },
            { id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward' },
          ],
          paging: { total: 2 },
        });
      }
      if (url.includes('/v1/docStore/name/persona.Analyst')) {
        return jsonResponse({
          name: 'Analyst-Analyst',
          fullyQualifiedName: 'persona.Analyst',
          entityType: 'Page',
          data: { pages: [{ pageType: 'LandingPage', layout: [] }] },
        });
      }
      if (url.includes('/v1/docStore/name/persona.Steward')) {
        return jsonResponse({
          name: 'Steward-Steward',
          fullyQualifiedName: 'persona.Steward',
          entityType: 'Page',
          data: { pages: [{ pageType: 'Table', layout: [] }, { layout: {} }] },
        });
      }
      return new Response('Not found', { status: 404 });
    }));
    const store = usePersonaStore();
    await store.ensureLoaded();
    await store.selectPersona('p1');
    expect(store.document?.data.pages?.[0]?.pageType).toBe('LandingPage');
    const pageDoc = await store.loadDocumentForPersona({
      fullyQualifiedName: 'Steward',
    });
    expect(pageDoc?.fullyQualifiedName).toBe('persona.Steward');
    expect(pageDoc?.data.pages).toHaveLength(1);
    expect(pageDoc?.data.pages?.[0]?.pageType).toBe('Table');
    expect(store.selectedPersona?.id).toBe('p1');
    // loadDocumentForPersona must not touch the persisted selection
    // (sessionStorage now holds it, per the 2026-11-25 nav change).
    expect(sessionStorage.getItem(PERSONA_STORAGE_KEY)).toBe('p1');
    expect(store.document?.fullyQualifiedName).toBe('persona.Analyst');
  });

  it('returns null for a missing page document and throws for other failures (§3.2④)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('persona.Missing')) {
        return new Response('Not found', { status: 404 });
      }
      return new Response('Server error', { status: 500 });
    }));
    const store = usePersonaStore();
    await expect(
      store.loadDocumentForPersona({ fullyQualifiedName: 'Missing' }),
    ).resolves.toBeNull();
    await expect(
      store.loadDocumentForPersona({ fullyQualifiedName: 'Broken' }),
    ).rejects.toMatchObject({ status: 500 });
    await expect(store.loadDocumentForPersona(null)).resolves.toBeNull();
    await expect(store.loadDocumentForPersona({})).resolves.toBeNull();
    expect(store.document).toBeNull();
  });

  it('syncs a save only into the selected persona’s document slot (U-09)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/personas')) {
        return jsonResponse({
          data: [
            { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' },
            { id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward' },
          ],
          paging: { total: 2 },
        });
      }
      return new Response('Not found', { status: 404 });
    }));
    const store = usePersonaStore();
    await store.ensureLoaded();
    await store.selectPersona('p1');
    store.syncSavedDocument({
      id: 'doc2',
      name: 'Steward-Steward',
      fullyQualifiedName: 'persona.Steward',
      entityType: 'Page',
      data: { pages: [{ pageType: 'Table', layout: [] }] },
    });
    expect(store.document).toBeNull();
    // The pageType-less entry simulates malformed wire data: it must
    // reach syncSavedDocument untyped, exactly as a fetch payload
    // does, because the normalizer's drop is the behavior under test.
    // Completing the entry would delete the assertion's subject.
    store.syncSavedDocument(
      JSON.parse(
        JSON.stringify({
          id: 'doc1',
          name: 'Analyst-Analyst',
          fullyQualifiedName: 'persona.Analyst',
          entityType: 'Page',
          data: { pages: [{ pageType: 'LandingPage', layout: [] }, { layout: {} }] },
        }),
      ),
    );
    expect(store.document?.data.pages).toHaveLength(1);
    expect(store.documentLoaded).toBe(true);
  });

  it('switching personas drops the previous document when the new one is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/personas')) {
        return jsonResponse({
          data: [
            { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' },
            { id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward' },
          ],
          paging: { total: 2 },
        });
      }
      if (url.includes('/v1/docStore/name/persona.Analyst')) {
        return jsonResponse({
          name: 'Analyst-Analyst',
          fullyQualifiedName: 'persona.Analyst',
          entityType: 'Page',
          data: { pages: [{ pageType: 'LandingPage', layout: [] }] },
        });
      }
      return new Response('Not found', { status: 404 });
    }));
    const store = usePersonaStore();
    await store.ensureLoaded();
    await store.selectPersona('p1');
    expect(store.document).not.toBeNull();
    await store.selectPersona('p2');
    expect(store.document).toBeNull();
    expect(store.documentLoaded).toBe(true);
  });
});
