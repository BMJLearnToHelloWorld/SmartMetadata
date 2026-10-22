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
import { createClassification, listClassifications, updateClassification } from './classifications';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('classifications API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists classifications from GET /v1/classifications', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'c1', name: 'PII', description: 'Personal data', termCount: 4 }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listClassifications({ limit: 50 });
    expect(page.data[0]?.name).toBe('PII');
    expect(lastFetch().url).toContain('/api/v1/classifications');
  });

  it('creates a classification with schema-required name and description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: 'Tier',
          description: 'Data tiering',
          mutuallyExclusive: true,
        });
        return new Response(JSON.stringify({ id: 'c2', name: 'Tier', description: 'Data tiering' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createClassification({
      name: 'Tier',
      description: 'Data tiering',
      mutuallyExclusive: true,
    });
    expect(created.id).toBe('c2');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('updates a classification through PUT /v1/classifications', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'c2', name: 'Tier', description: 'Updated' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await updateClassification({ name: 'Tier', description: 'Updated' });
    expect(lastFetch().init?.method).toBe('PUT');
    expect(lastFetch().url).toContain('/api/v1/classifications');
  });
});
