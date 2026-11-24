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
import { createGlossary, exportGlossaryInCSVFormat, listGlossaries, updateGlossary } from './glossaries';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('glossaries API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists glossaries from GET /v1/glossaries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'g1', name: 'Business', description: 'Terms', termCount: 3 }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listGlossaries({ limit: 50 });
    expect(page.data[0]?.name).toBe('Business');
    expect(lastFetch().url).toContain('/api/v1/glossaries');
    expect(lastFetch().url).toContain('fields=');
  });

  it('creates a glossary with schema-required name and description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { name?: string; description?: string };
        expect(body).toMatchObject({ name: 'Finance', description: 'Finance terms' });
        return new Response(JSON.stringify({ id: 'g2', name: 'Finance', description: 'Finance terms' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createGlossary({ name: 'Finance', description: 'Finance terms' });
    expect(created.id).toBe('g2');
    expect(lastFetch().url).toContain('/api/v1/glossaries');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('updates a glossary through PUT /v1/glossaries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'g2', name: 'Finance', description: 'Updated' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await updateGlossary({ name: 'Finance', description: 'Updated' });
    expect(lastFetch().init?.method).toBe('PUT');
    expect(lastFetch().url).toContain('/api/v1/glossaries');
  });

  it('exports a glossary through GET /v1/glossaries/name/{fqn}/exportAsync and dispatches the CSV jobs refresh event (B2-G6)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ jobId: 'job-1', message: 'started' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const seen: Event[] = [];
    const listener = (event: Event): void => {
      seen.push(event);
    };
    window.addEventListener('csv-jobs-refresh', listener);
    try {
      const payload = await exportGlossaryInCSVFormat('Business');
      expect(payload).toMatchObject({ jobId: 'job-1' });
      expect(lastFetch().url).toContain('/api/v1/glossaries/name/Business/exportAsync');
      expect(seen).toHaveLength(1);
    } finally {
      window.removeEventListener('csv-jobs-refresh', listener);
    }
  });

  it('returns an empty job when the export response carries no jobId (B2-G6)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'started' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const payload = await exportGlossaryInCSVFormat('Business');
    expect(payload).toEqual({});
  });
});
