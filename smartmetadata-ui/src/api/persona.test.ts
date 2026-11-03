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
  createPersona,
  getPersonaByName,
  listPersonas,
  personaUsersPatch,
  searchPersonas,
  updatePersona,
} from './persona';

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

describe('persona API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists personas from GET /v1/personas with users fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
      paging: { total: 1 },
    })));
    const page = await listPersonas({ limit: 12 });
    expect(page.data[0]?.name).toBe('Analyst');
    expect(lastFetch().url).toContain('/api/v1/personas');
    expect(lastFetch().url).toContain('fields=users');
  });

  it('searches personas from GET /v1/personas/search', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'p1', name: 'Analyst' }],
      paging: { total: 1 },
    })));
    const rows = await searchPersonas('Ana', 25);
    expect(rows).toHaveLength(1);
    expect(lastFetch().url).toContain('/api/v1/personas/search');
    expect(lastFetch().url).toContain('q=Ana');
  });

  it('fetches a persona by name with the official default fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst',
      users: [{ id: 'u1', name: 'ada', type: 'user' }],
    })));
    const persona = await getPersonaByName('Analyst');
    expect(persona.users).toHaveLength(1);
    expect(lastFetch().url).toContain('/api/v1/personas/name/Analyst');
    expect(lastFetch().url).toContain('users');
  });

  it('creates a persona with POST /v1/personas and user ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'p9', name: 'Steward' })));
    const persona = await createPersona({ name: 'Steward', users: ['u1', 'u2'] });
    expect(persona.id).toBe('p9');
    expect(lastFetch().init?.method).toBe('POST');
    expect(String(lastFetch().init?.body)).toContain('"users":["u1","u2"]');
  });

  it('updates a persona with a JSON Patch PATCH', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'p1', name: 'Analyst', default: true })));
    const persona = await updatePersona('p1', [{ op: 'replace', path: '/default', value: true }]);
    expect(persona.default).toBe(true);
    expect(lastFetch().init?.method).toBe('PATCH');
    expect(lastFetch().init?.headers).toMatchObject({ 'Content-Type': 'application/json-patch+json' });
  });

  it('builds a full-reference users replace op', () => {
    const patch = personaUsersPatch([{ id: 'u1', name: 'ada', type: 'user' }]);
    expect(patch).toEqual([
      { op: 'replace', path: '/users', value: [{ id: 'u1', name: 'ada', type: 'user' }] },
    ]);
  });
});
