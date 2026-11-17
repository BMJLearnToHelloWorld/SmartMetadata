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
import { countDataModels, listDataModels } from './dataModels';

describe('data models API (pin dashboardAPI.ts getDataModels)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function lastUrl(): URL {
    const call = vi.mocked(fetch).mock.calls.at(-1);
    if (!call) {
      throw new Error('fetch was not called');
    }
    return new URL(String(call[0]));
  }

  it('lists data models with service, fields, cursor, include, and limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'dm1', name: 'orders', dataModelType: 'DbtModel' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listDataModels({
      service: 'svc.dash',
      fields: 'tags,owners',
      after: 'cur',
      include: 'non-deleted',
      limit: 15,
    });
    const url = lastUrl();
    expect(url.pathname).toBe('/api/v1/dashboard/datamodels');
    expect(url.searchParams.get('service')).toBe('svc.dash');
    expect(url.searchParams.get('fields')).toBe('tags,owners');
    expect(url.searchParams.get('after')).toBe('cur');
    expect(url.searchParams.get('include')).toBe('non-deleted');
    expect(url.searchParams.get('limit')).toBe('15');
    expect(url.searchParams.has('before')).toBe(false);
    expect(page.data).toEqual([expect.objectContaining({ id: 'dm1', dataModelType: 'DbtModel' })]);
  });

  it('counts with limit 0 and no fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [], paging: { total: 4 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const total = await countDataModels('svc.dash', 'non-deleted');
    expect(total).toBe(4);
    const url = lastUrl();
    expect(url.searchParams.get('limit')).toBe('0');
    expect(url.searchParams.get('service')).toBe('svc.dash');
    expect(url.searchParams.has('fields')).toBe(false);
  });
});
