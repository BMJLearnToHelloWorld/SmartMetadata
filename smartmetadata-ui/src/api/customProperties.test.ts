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
  deleteCustomPropertyByName,
  filterCustomProperties,
  getMetadataTypeByName,
  getPropertyConfigSummary,
  getPropertyTypeOptions,
  listCustomProperties,
  listMetadataTypes,
  listPropertyTypes,
  mapCustomProperty,
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
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
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

  it('parses customPropertyConfig read-side (string, array, and object forms)', () => {
    expect(
      mapCustomProperty({ name: 'fmt', customPropertyConfig: { config: 'email' } }),
    ).toMatchObject({ customPropertyConfig: { config: 'email' } });
    expect(
      mapCustomProperty({ name: 'refs', customPropertyConfig: { config: ['table', 'topic'] } }),
    ).toMatchObject({ customPropertyConfig: { config: ['table', 'topic'] } });
    expect(
      mapCustomProperty({
        name: 'tier',
        customPropertyConfig: { config: { values: ['a', 'b'], multiSelect: true } },
      }),
    ).toMatchObject({
      customPropertyConfig: { config: { values: ['a', 'b'], multiSelect: true } },
    });
    expect(mapCustomProperty({ name: 'plain' })?.customPropertyConfig).toBeUndefined();
    expect(
      mapMetadataType({ name: 'table', schema: '{"type":"object"}', customProperties: [] }),
    ).toMatchObject({ schema: '{"type":"object"}' });
  });

  it('summarizes customPropertyConfig in the four official forms', () => {
    expect(
      getPropertyConfigSummary({ name: 'fmt', customPropertyConfig: { config: 'email' } }),
    ).toMatchObject({ kind: 'format', values: ['email'], testId: 'fmt-config' });
    expect(
      getPropertyConfigSummary({ name: 'refs', customPropertyConfig: { config: ['table', 'topic'] } }),
    ).toMatchObject({ kind: 'entityTypes', values: ['Table', 'Topic'] });
    expect(
      getPropertyConfigSummary({
        name: 'cols',
        customPropertyConfig: { config: { columns: ['a', 'b'] } },
      }),
    ).toMatchObject({ kind: 'columns', values: ['a', 'b'], testId: 'table-config' });
    expect(
      getPropertyConfigSummary({
        name: 'tier',
        customPropertyConfig: { config: { values: ['a', 'b', 'c', 'd'], multiSelect: true } },
      }),
    ).toMatchObject({ kind: 'values', multiSelect: true, values: ['a', 'b', 'c', 'd'], testId: 'enum-config' });
    expect(getPropertyConfigSummary({ name: 'plain' })).toBeUndefined();
    expect(
      getPropertyConfigSummary({ name: 'empty', customPropertyConfig: { config: '' } }),
    ).toBeUndefined();
  });

  it('filters by name and display name only, never by description', () => {
    const defs = [
      { name: 'retentionDays', displayName: 'Retention days', description: 'keep rows' },
      { name: 'ownerTeam', displayName: 'Owner team', description: 'retention policy owner' },
    ];
    expect(filterCustomProperties(defs, 'retention').map((d) => d.name)).toEqual(['retentionDays']);
    expect(filterCustomProperties(defs, 'Owner team').map((d) => d.name)).toEqual(['ownerTeam']);
    // 'keep rows' lives only in a description: official search does not match it.
    expect(filterCustomProperties(defs, 'keep rows')).toEqual([]);
    expect(
      filterCustomProperties(
        [
          { name: 'a', propertyType: 'string' },
          { name: 'b', propertyType: 'integer' },
        ],
        '',
        ['integer'],
      ).map((d) => d.name),
    ).toEqual(['b']);
  });

  it('builds type filter options from present types, sorted with counts', () => {
    expect(
      getPropertyTypeOptions([
        { name: 'a', propertyType: 'string' },
        { name: 'b', propertyType: 'integer' },
        { name: 'c', propertyType: 'string' },
        { name: 'd' },
      ]),
    ).toEqual([
      { value: 'integer', label: 'integer', count: 1 },
      { value: 'string', label: 'string', count: 2 },
    ]);
  });

  describe('deleteCustomPropertyByName (official patchCustomPropertyByName)', () => {
    const typeWith = (names: string[]) => ({
      id: 'tid',
      name: 'table',
      customProperties: names.map((name) => ({ name, propertyType: { name: 'string' } })),
    });

    function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
      return fetchMock.mock.calls.filter(
        ([, init]) => String((init as RequestInit | undefined)?.method || '').toUpperCase() === 'PATCH',
      );
    }

    it('PATCHes test+remove by index and returns the updated type', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(init?.method || '').toUpperCase() === 'PATCH') {
          return new Response(JSON.stringify(typeWith(['otherProp'])), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(typeWith(['otherProp', 'retentionDays'])), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const updated = await deleteCustomPropertyByName('table', 'retentionDays');
      expect(updated?.customProperties.map((d) => d.name)).toEqual(['otherProp']);
      const calls = patchCalls(fetchMock);
      expect(calls).toHaveLength(1);
      const [, init] = calls[0]!;
      expect((init as RequestInit).headers).toMatchObject({
        'Content-Type': 'application/json-patch+json',
      });
      expect(JSON.parse(String((init as RequestInit).body))).toEqual([
        { op: 'test', path: '/customProperties/1/name', value: 'retentionDays' },
        { op: 'remove', path: '/customProperties/1' },
      ]);
      expect(String(calls[0]![0])).toContain('/api/v1/metadata/types/tid');
    });

    it('rebuilds the patch after a stale-index 400 and retries', async () => {
      let patchCount = 0;
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(init?.method || '').toUpperCase() === 'PATCH') {
          patchCount += 1;
          if (patchCount === 1) {
            return new Response(JSON.stringify({ message: 'stale index' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify(typeWith([])), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // First GET: property at index 1; second GET (after the 400): index 0.
        return new Response(
          JSON.stringify(
            typeWith(patchCount === 0 ? ['otherProp', 'retentionDays'] : ['retentionDays']),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      const updated = await deleteCustomPropertyByName('table', 'retentionDays');
      expect(updated?.customProperties).toEqual([]);
      const calls = patchCalls(fetchMock);
      expect(calls).toHaveLength(2);
      expect(JSON.parse(String((calls[0]![1] as RequestInit).body))).toEqual([
        { op: 'test', path: '/customProperties/1/name', value: 'retentionDays' },
        { op: 'remove', path: '/customProperties/1' },
      ]);
      expect(JSON.parse(String((calls[1]![1] as RequestInit).body))).toEqual([
        { op: 'test', path: '/customProperties/0/name', value: 'retentionDays' },
        { op: 'remove', path: '/customProperties/0' },
      ]);
    });

    it('resolves undefined without a PATCH when the property is already gone', async () => {
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify(typeWith([])), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);
      await expect(deleteCustomPropertyByName('table', 'retentionDays')).resolves.toBeUndefined();
      expect(patchCalls(fetchMock)).toHaveLength(0);
    });

    it('throws other errors without retrying', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(init?.method || '').toUpperCase() === 'PATCH') {
          return new Response(JSON.stringify({ message: 'boom' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(typeWith(['retentionDays'])), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      await expect(deleteCustomPropertyByName('table', 'retentionDays')).rejects.toThrow();
      expect(patchCalls(fetchMock)).toHaveLength(1);
    });

    it('gives up after three stale-index 400s', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(init?.method || '').toUpperCase() === 'PATCH') {
          return new Response(JSON.stringify({ message: 'stale index' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(typeWith(['retentionDays'])), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      await expect(deleteCustomPropertyByName('table', 'retentionDays')).rejects.toMatchObject({
        status: 400,
      });
      expect(patchCalls(fetchMock)).toHaveLength(3);
    });

    it('re-GETs when the PATCH response carries no usable type', async () => {
      let gets = 0;
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(init?.method || '').toUpperCase() === 'PATCH') {
          return new Response('', { status: 200 });
        }
        gets += 1;
        return new Response(
          JSON.stringify(
            gets === 1 ? typeWith(['retentionDays']) : typeWith(['otherProp']),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      const updated = await deleteCustomPropertyByName('table', 'retentionDays');
      expect(updated?.customProperties.map((d) => d.name)).toEqual(['otherProp']);
    });
  });
});
