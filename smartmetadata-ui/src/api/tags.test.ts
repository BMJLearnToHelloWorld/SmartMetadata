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
import { createTag, listTags, updateTag } from './tags';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('tags API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists tags filtered by parent classification FQN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'tg1', name: 'Sensitive', fullyQualifiedName: 'PII.Sensitive' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTags({ parent: 'PII', limit: 50 });
    expect(page.data[0]?.fullyQualifiedName).toBe('PII.Sensitive');
    expect(lastFetch().url).toContain('/api/v1/tags');
    expect(lastFetch().url).toContain('parent=PII');
  });

  it('creates a tag with name, description, and classification FQN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: 'Confidential',
          description: 'Restricted',
          classification: 'PII',
        });
        return new Response(
          JSON.stringify({ id: 'tg2', name: 'Confidential', fullyQualifiedName: 'PII.Confidential' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const created = await createTag({
      name: 'Confidential',
      description: 'Restricted',
      classification: 'PII',
    });
    expect(created.id).toBe('tg2');
    expect(lastFetch().init?.method).toBe('POST');
    expect(lastFetch().url).toContain('/api/v1/tags');
  });

  it('updates a tag through PUT /v1/tags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'tg2', name: 'Confidential', description: 'Updated' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await updateTag({ name: 'Confidential', description: 'Updated', classification: 'PII' });
    expect(lastFetch().init?.method).toBe('PUT');
  });
});
