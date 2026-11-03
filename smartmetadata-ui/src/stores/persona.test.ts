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
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
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
    expect(localStorage.getItem(PERSONA_STORAGE_KEY)).toBe('p2');
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
    expect(localStorage.getItem(PERSONA_STORAGE_KEY)).toBeNull();
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
  });
});
