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
import { createLlmService, listLlmServices } from './llmServices';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('llmServices API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists services from GET /v1/services/llmServices with kind llm', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 's1', name: 'svc', serviceType: 'X' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listLlmServices({ limit: 50 });
    expect(page.data[0]).toMatchObject({ id: 's1', name: 'svc', kind: 'llm', serviceType: 'X' });
    expect(lastFetch().url).toContain('/api/v1/services/llmServices');
  });

  it('creates a service with schema-required name and serviceType', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({ name: 'svc', serviceType: 'X' });
        return new Response(JSON.stringify({ id: 's1', name: 'svc', serviceType: 'X' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createLlmService({ name: 'svc', serviceType: 'X' });
    expect(created).toMatchObject({ id: 's1', kind: 'llm' });
    expect(lastFetch().init?.method).toBe('POST');
  });
});
