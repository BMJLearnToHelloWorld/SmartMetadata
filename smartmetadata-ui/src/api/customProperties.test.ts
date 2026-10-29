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
import {
  ENTITY_TYPE_CATEGORY,
  FIELD_TYPE_CATEGORY,
  addOrUpdateCustomProperty,
  getMetadataTypeByName,
  listCustomProperties,
  listMetadataTypes,
  listPropertyTypes,
  mapMetadataType,
  TYPE_FIELDS,
} from './customProperties';

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

  it('maps entity types and lists them from GET /v1/metadata/types', async () => {
    expect(mapMetadataType({ displayName: 'orphan' })).toBeNull();
    expect(mapMetadataType({ name: 'table', customProperties: [{ name: 'retentionDays' }] })).toMatchObject({
      name: 'table',
      customProperties: [{ name: 'retentionDays' }],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ name: 'table', category: 'entity', customProperties: [] }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listMetadataTypes();
    expect(page.data[0]?.name).toBe('table');
    expect(page.total).toBe(1);
    const url = decodeURIComponent(lastFetch().url);
    expect(url).toContain('/api/v1/metadata/types');
    expect(url).toContain(`category=${ENTITY_TYPE_CATEGORY}`);
    expect(url).toContain(`fields=${TYPE_FIELDS}`);
  });

  it('returns an empty page when GET /v1/metadata/types has no data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await expect(listMetadataTypes()).resolves.toEqual({
      data: [],
      after: undefined,
      before: undefined,
      total: undefined,
    });
  });

  it('loads one type by name including customProperties', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'tid',
            name: 'table',
            customProperties: [{ name: 'retentionDays', propertyType: { name: 'integer' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const meta = await getMetadataTypeByName('table');
    expect(meta.id).toBe('tid');
    expect(meta.customProperties[0]?.name).toBe('retentionDays');
    expect(decodeURIComponent(lastFetch().url)).toContain('/api/v1/metadata/types/name/table');
  });

  it('lists field property types with category=field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: [{ id: 'f1', name: 'string', category: 'field' }], paging: { total: 1 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listPropertyTypes();
    expect(page.data[0]?.name).toBe('string');
    expect(decodeURIComponent(lastFetch().url)).toContain(`category=${FIELD_TYPE_CATEGORY}`);
  });

  it('adds or updates a custom property with PUT /v1/metadata/types/{id}', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'tid',
          name: 'table',
          customProperties: [{ name: 'retentionDays', description: 'days', propertyType: { name: 'integer' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const updated = await addOrUpdateCustomProperty('tid', {
      name: 'retentionDays',
      description: 'days',
      propertyType: { id: 'f1', type: 'type', name: 'integer' },
    });
    expect(updated.customProperties[0]?.name).toBe('retentionDays');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/metadata/types/tid');
    expect(init?.method).toBe('PUT');
  });
});
