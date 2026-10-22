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
import { listCustomProperties } from './customProperties';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('custom properties API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads definitions from GET /v1/metadata/types/name/{entityType}/customProperties', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              name: 'retentionDays',
              displayName: 'Retention days',
              description: 'How long to keep rows',
              propertyType: { name: 'integer' },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const defs = await listCustomProperties('table');
    expect(defs[0]).toMatchObject({ name: 'retentionDays', propertyType: 'integer' });
    expect(lastFetch().url).toContain('/api/v1/metadata/types/name/table/customProperties');
  });
});
