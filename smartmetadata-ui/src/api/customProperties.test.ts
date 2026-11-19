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
import type { CustomPropertyDef } from '@/types/collaboration';
import {
  ADD_CUSTOM_PROPERTIES_DOCS,
  ENTITY_TYPE_CATEGORY,
  FIELD_TYPE_CATEGORY,
  TYPE_FIELDS,
  addOrUpdateCustomProperty,
  buildCustomPropertyConfig,
  customPropertySorter,
  deleteCustomPropertyByName,
  filterCustomProperties,
  getCustomPropertyChanges,
  getCustomPropertyPageHeader,
  getCustomPropertyRouteSegment,
  getCustomPropertyTypeFlags,
  getEditFormValues,
  getEntityName,
  getMetadataTypeByName,
  getPropertyConfigSummary,
  getPropertyTypeBadge,
  getPropertyTypeOptions,
  listCustomProperties,
  listMetadataTypes,
  listPropertyTypes,
  mapCustomProperty,
  mapMetadataType,
  propertyTypeLabel,
  startCase,
  toCustomPropertyPayload,
  updateCustomPropertyByName,
  validateCustomPropertyEditForm,
  validateCustomPropertyForm,
  type CustomPropertyFieldLabels,
  type CustomPropertyFormValues,
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

  it('loads one type by name with fields=customProperties only', async () => {
    expect(TYPE_FIELDS).toBe('customProperties');
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
    const url = decodeURIComponent(lastFetch().url);
    expect(url).toContain('/api/v1/metadata/types/name/table');
    expect(url).toContain('fields=customProperties');
    expect(url).not.toContain('schema');
  });

  it('lists field property types with category=field, limit 20, and no fields', async () => {
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
    const url = decodeURIComponent(lastFetch().url);
    expect(url).toContain(`category=${FIELD_TYPE_CATEGORY}`);
    expect(url).toContain('limit=20');
    expect(url).not.toContain('fields=');
  });

  it('adds or updates a custom property with PUT and ignores the response body', async () => {
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
    await expect(
      addOrUpdateCustomProperty('tid', {
        name: 'retentionDays',
        description: 'days',
        propertyType: { id: 'f1', type: 'type', name: 'integer' },
      }),
    ).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/metadata/types/tid');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'retentionDays',
      description: 'days',
      propertyType: { id: 'f1', type: 'type', name: 'integer' },
    });
  });

  it('resolves when the PUT response has no type body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      addOrUpdateCustomProperty('tid', {
        name: 'retentionDays',
        description: 'days',
        propertyType: { id: 'f1', type: 'type', name: 'integer' },
      }),
    ).resolves.toBeUndefined();
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

  it('builds type filter options from present types, sorted by badge label with counts', () => {
    const resolveBadgeLabel = (badge: { labelKey?: string; fallbackLabel: string }): string =>
      badge.labelKey ?? badge.fallbackLabel;
    expect(
      getPropertyTypeOptions(
        [
          { name: 'a', propertyType: 'string' },
          { name: 'b', propertyType: 'integer' },
          { name: 'c', propertyType: 'string' },
          { name: 'd' },
        ],
        resolveBadgeLabel,
      ),
    ).toEqual([
      { value: 'integer', label: 'label.integer', count: 1 },
      { value: 'string', label: 'label.string', count: 2 },
    ]);
    // Unmapped types fall back to the startCase label and sort with the rest.
    expect(
      getPropertyTypeOptions(
        [
          { name: 'a', propertyType: 'myCustom-cp' },
          { name: 'b', propertyType: 'integer' },
        ],
        resolveBadgeLabel,
      ),
    ).toEqual([
      { value: 'integer', label: 'label.integer', count: 1 },
      { value: 'myCustom-cp', label: 'My Custom', count: 1 },
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
  });

  describe('stage 3 config flags and payload (official buildCustomPropertyConfig)', () => {
    it('flags the four config kinds by property type name', () => {
      expect(getCustomPropertyTypeFlags('enum')).toMatchObject({
        hasEnumConfig: true,
        hasFormatConfig: false,
        hasEntityReferenceConfig: false,
        hasTableTypeConfig: false,
      });
      expect(getCustomPropertyTypeFlags('date-cp').supportedFormats).toHaveLength(7);
      // The pin's constants file lists 8 dateTime formats (the review's "9" is a miscount).
      expect(getCustomPropertyTypeFlags('dateTime-cp').supportedFormats).toHaveLength(8);
      expect(getCustomPropertyTypeFlags('time-cp').supportedFormats).toEqual(['HH:mm:ss']);
      expect(getCustomPropertyTypeFlags('entityReference').hasEntityReferenceConfig).toBe(true);
      expect(getCustomPropertyTypeFlags('entityReferenceList').hasEntityReferenceConfig).toBe(true);
      expect(getCustomPropertyTypeFlags('table-cp').hasTableTypeConfig).toBe(true);
      expect(getCustomPropertyTypeFlags('string')).toMatchObject({
        hasEnumConfig: false,
        hasFormatConfig: false,
        hasEntityReferenceConfig: false,
        hasTableTypeConfig: false,
        supportedFormats: [],
      });
    });

    it('builds the four config forms and returns undefined for plain types', () => {
      // INV-16 (t367): the create path preserves order and duplicates.
      expect(
        buildCustomPropertyConfig(
          { enumConfig: ['gold', 'silver', 'gold'], multiSelect: true },
          getCustomPropertyTypeFlags('enum'),
        ),
      ).toEqual({ config: { multiSelect: true, values: ['gold', 'silver', 'gold'] } });
      expect(
        buildCustomPropertyConfig(
          { formatConfig: 'dd-MM-yyyy' },
          getCustomPropertyTypeFlags('date-cp'),
        ),
      ).toEqual({ config: 'dd-MM-yyyy' });
      expect(
        buildCustomPropertyConfig(
          { entityReferenceConfig: ['table', 'topic'] },
          getCustomPropertyTypeFlags('entityReference'),
        ),
      ).toEqual({ config: ['table', 'topic'] });
      expect(
        buildCustomPropertyConfig(
          { columns: ['a', 'b', 'a'] },
          getCustomPropertyTypeFlags('table-cp'),
        ),
      ).toEqual({ config: { columns: ['a', 'b', 'a'] } });
      expect(
        buildCustomPropertyConfig({}, getCustomPropertyTypeFlags('string')),
      ).toBeUndefined();
      expect(
        buildCustomPropertyConfig({}, getCustomPropertyTypeFlags('date-cp')),
      ).toBeUndefined();
    });

    it('preserves duplicates through the create ID mapping (t367 acceptance cases)', () => {
      expect(
        buildCustomPropertyConfig(
          { enumConfig: ['A', 'A', 'B'], multiSelect: false },
          getCustomPropertyTypeFlags('enum'),
        ),
      ).toEqual({ config: { multiSelect: false, values: ['A', 'A', 'B'] } });
      expect(
        buildCustomPropertyConfig(
          { columns: ['c', 'c'] },
          getCustomPropertyTypeFlags('table-cp'),
        ),
      ).toEqual({ config: { columns: ['c', 'c'] } });
    });

    it('assembles the create payload without the condition fields', () => {
      const payload = toCustomPropertyPayload(
        {
          name: 'tier',
          displayName: '',
          description: 'Service tier',
          propertyTypeName: 'enum',
          enumConfig: ['gold'],
          multiSelect: false,
          formatConfig: '',
          entityReferenceConfig: [],
          columns: [],
        },
        { id: 'f-enum', name: 'enum' },
      );
      expect(payload).toEqual({
        name: 'tier',
        description: 'Service tier',
        propertyType: { id: 'f-enum', type: 'type' },
        customPropertyConfig: { config: { multiSelect: false, values: ['gold'] } },
      });
      // Key-exact: propertyType carries only id and type, never name.
      expect(Object.keys(payload.propertyType).sort()).toEqual(['id', 'type']);
      expect('enumConfig' in payload).toBe(false);
      const plain = toCustomPropertyPayload(
        {
          name: 'note',
          displayName: 'Note',
          description: 'd',
          propertyTypeName: 'string',
          enumConfig: [],
          multiSelect: false,
          formatConfig: '',
          entityReferenceConfig: [],
          columns: [],
        },
        { id: 'f-str', name: 'string' },
      );
      expect(plain).toEqual({
        name: 'note',
        description: 'd',
        propertyType: { id: 'f-str', type: 'type' },
        displayName: 'Note',
      });
      expect('customPropertyConfig' in plain).toBe(false);
    });

    it('labels property types per official (no sqlQuery special case, -cp stripped)', () => {
      expect(propertyTypeLabel('sqlQuery', 'SQL query')).toBe('SQL Query');
      expect(propertyTypeLabel('sqlQuery', undefined)).toBe('Sql Query');
      expect(propertyTypeLabel('date-cp', undefined)).toBe('Date');
      expect(propertyTypeLabel('date-cp', 'My Date')).toBe('My Date');
      expect(propertyTypeLabel('entityReference', undefined)).toBe('Entity Reference');
    });
  });

  describe('validateCustomPropertyForm (official form rules)', () => {
    const labels: CustomPropertyFieldLabels = {
      name: 'Name',
      displayName: 'Display Name',
      description: 'Description',
      propertyType: 'Type',
      enumConfig: 'Enum Values',
      formatConfig: 'Format',
      entityReferenceConfig: 'Entity Reference Types',
      columns: 'Columns',
    };
    const base: CustomPropertyFormValues = {
      name: 'tier',
      displayName: '',
      description: 'Service tier',
      propertyTypeName: 'enum',
      enumConfig: ['gold'],
      multiSelect: false,
      formatConfig: '',
      entityReferenceConfig: [],
      columns: [],
    };

    it('accepts a valid form', () => {
      expect(validateCustomPropertyForm(base, labels)).toEqual([]);
    });

    it('rejects an empty, too-long, or invalid name with field-keyed issues', () => {
      expect(validateCustomPropertyForm({ ...base, name: '' }, labels)).toEqual([
        { field: 'name', key: 'label.field-required', params: { field: 'Name' } },
      ]);
      expect(
        validateCustomPropertyForm({ ...base, name: 'a'.repeat(257) }, labels),
      ).toContainEqual({
        field: 'name',
        key: 'message.entity-size-in-between',
        params: { entity: 'Name', min: 1, max: 256 },
      });
      expect(
        validateCustomPropertyForm({ ...base, name: 'bad"name' }, labels),
      ).toContainEqual({ field: 'name', key: 'message.custom-property-name-validation' });
      // The regex allows a leading digit and spaces inside.
      expect(validateCustomPropertyForm({ ...base, name: '9 lives ok' }, labels)).toEqual([]);
      // Values are used as-is: a leading space fails the regex (no trim).
      expect(
        validateCustomPropertyForm({ ...base, name: ' tier' }, labels),
      ).toContainEqual({ field: 'name', key: 'message.custom-property-name-validation' });
    });

    it('has no uniqueness rule: a duplicate name is not rejected', () => {
      expect(validateCustomPropertyForm({ ...base, name: 'Tier' }, labels)).toEqual([]);
    });

    it('rejects a missing description or property type', () => {
      expect(validateCustomPropertyForm({ ...base, description: '' }, labels)).toContainEqual({
        field: 'description',
        key: 'label.field-required',
        params: { field: 'Description' },
      });
      expect(validateCustomPropertyForm({ ...base, propertyTypeName: '' }, labels)).toEqual([
        { field: 'propertyType', key: 'label.field-required', params: { field: 'Type' } },
      ]);
    });

    it('requires each conditional field for its type', () => {
      expect(validateCustomPropertyForm({ ...base, enumConfig: [] }, labels)).toContainEqual({
        field: 'enumConfig',
        key: 'label.field-required',
        params: { field: 'Enum Values' },
      });
      // Format is NOT required; only an unsupported value is invalid.
      expect(
        validateCustomPropertyForm({ ...base, propertyTypeName: 'date-cp' }, labels),
      ).toEqual([]);
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'date-cp', formatConfig: 'yyyy-MM-dd HH:mm' },
          labels,
        ),
      ).toContainEqual({
        field: 'formatConfig',
        key: 'label.field-invalid',
        params: { field: 'Format' },
      });
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'date-cp', formatConfig: 'dd-MM-yyyy' },
          labels,
        ),
      ).toEqual([]);
      expect(
        validateCustomPropertyForm({ ...base, propertyTypeName: 'entityReference' }, labels),
      ).toContainEqual({
        field: 'entityReferenceConfig',
        key: 'label.field-required',
        params: { field: 'Entity Reference Types' },
      });
      expect(
        validateCustomPropertyForm({ ...base, propertyTypeName: 'table-cp' }, labels),
      ).toContainEqual({
        field: 'columns',
        key: 'label.field-required',
        params: { field: 'Columns' },
      });
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'table-cp', columns: ['a', 'b', 'c', 'd'] },
          labels,
        ),
      ).toContainEqual({
        field: 'columns',
        key: 'message.maximum-count-allowed',
        params: { count: 3, label: 'Columns' },
      });
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'table-cp', columns: ['__row_id__'] },
          labels,
        ),
      ).toContainEqual({
        field: 'columns',
        key: 'message.reserved-column-name',
        params: { name: '__row_id__' },
      });
    });
  });

  describe('validateCustomPropertyEditForm (official edit rules)', () => {
    const labels: CustomPropertyFieldLabels = {
      name: 'Name',
      displayName: 'Display Name',
      description: 'Description',
      propertyType: 'Type',
      enumConfig: 'Enum Values',
      formatConfig: 'Format',
      entityReferenceConfig: 'Entity Reference Types',
      columns: 'Columns',
    };

    it('accepts a valid edit and ignores condition fields for other types', () => {
      expect(
        validateCustomPropertyEditForm(
          {
            displayName: 'Tier',
            description: 'd',
            enumConfig: ['gold'],
            multiSelect: false,
            entityReferenceConfig: [],
          },
          { name: 'tier', propertyType: 'enum' },
          labels,
        ),
      ).toEqual([]);
      expect(
        validateCustomPropertyEditForm(
          {
            displayName: '',
            description: 'd',
            enumConfig: [],
            multiSelect: false,
            entityReferenceConfig: [],
          },
          { name: 'note', propertyType: 'string' },
          labels,
        ),
      ).toEqual([]);
    });

    it('requires description, enum values, and entity-reference types', () => {
      expect(
        validateCustomPropertyEditForm(
          {
            displayName: '',
            description: '',
            enumConfig: ['gold'],
            multiSelect: false,
            entityReferenceConfig: [],
          },
          { name: 'tier', propertyType: 'enum' },
          labels,
        ),
      ).toContainEqual({
        field: 'description',
        key: 'label.field-required',
        params: { field: 'Description' },
      });
      expect(
        validateCustomPropertyEditForm(
          {
            displayName: '',
            description: 'd',
            enumConfig: [],
            multiSelect: false,
            entityReferenceConfig: [],
          },
          { name: 'tier', propertyType: 'enum' },
          labels,
        ),
      ).toContainEqual({
        field: 'enumConfig',
        key: 'label.field-required',
        params: { field: 'Enum Values' },
      });
      expect(
        validateCustomPropertyEditForm(
          {
            displayName: '',
            description: 'd',
            enumConfig: [],
            multiSelect: false,
            entityReferenceConfig: [],
          },
          { name: 'refs', propertyType: 'entityReference' },
          labels,
        ),
      ).toContainEqual({
        field: 'entityReferenceConfig',
        key: 'label.field-required',
        params: { field: 'Entity Reference Types' },
      });
    });
  });

  describe('getCustomPropertyChanges (official edit diff input)', () => {
    it('builds the enum config and drops an unchanged displayName', () => {
      const property: CustomPropertyDef = {
        name: 'tier',
        displayName: 'Tier',
        description: 'old',
        propertyType: 'enum',
        customPropertyConfig: { config: { values: ['gold'], multiSelect: false } },
      };
      expect(
        getCustomPropertyChanges(property, {
          displayName: 'Tier',
          description: 'new',
          enumConfig: ['gold', 'silver', 'silver'],
          multiSelect: true,
          entityReferenceConfig: [],
        }),
      ).toEqual({
        displayName: undefined,
        description: 'new',
        customPropertyConfig: { config: { multiSelect: true, values: ['gold', 'silver'] } },
      });
    });

    it('keeps saved entity-reference types (additive only)', () => {
      const property: CustomPropertyDef = {
        name: 'refs',
        description: 'd',
        propertyType: 'entityReference',
        customPropertyConfig: { config: ['table'] },
      };
      expect(
        getCustomPropertyChanges(property, {
          displayName: '',
          description: 'd',
          enumConfig: [],
          multiSelect: false,
          entityReferenceConfig: ['topic'],
        }),
      ).toEqual({
        displayName: undefined,
        description: 'd',
        customPropertyConfig: { config: ['table', 'topic'] },
      });
      // t367: saved [T1] + selected [T2, T2] → [T1, T2]; T1 must not be deleted.
      expect(
        getCustomPropertyChanges(property, {
          displayName: '',
          description: 'd',
          enumConfig: [],
          multiSelect: false,
          entityReferenceConfig: ['topic', 'topic'],
        }),
      ).toEqual({
        displayName: undefined,
        description: 'd',
        customPropertyConfig: { config: ['table', 'topic'] },
      });
    });

    it('leaves the config unset for format and table properties', () => {
      const property: CustomPropertyDef = {
        name: 'fmt',
        description: 'd',
        propertyType: 'date-cp',
        customPropertyConfig: { config: 'yyyy-MM-dd' },
      };
      expect(
        getCustomPropertyChanges(property, {
          displayName: 'Fmt',
          description: 'd2',
          enumConfig: [],
          multiSelect: false,
          entityReferenceConfig: [],
        }),
      ).toEqual({ displayName: 'Fmt', description: 'd2' });
    });

    it('seeds the edit form from the saved property', () => {
      expect(
        getEditFormValues({
          name: 'tier',
          displayName: 'Tier',
          description: 'd',
          propertyType: 'enum',
          customPropertyConfig: { config: { values: ['gold'], multiSelect: true } },
        }),
      ).toEqual({
        displayName: 'Tier',
        description: 'd',
        enumConfig: ['gold'],
        multiSelect: true,
        entityReferenceConfig: [],
      });
      expect(
        getEditFormValues({
          name: 'refs',
          description: 'd',
          propertyType: 'entityReference',
          customPropertyConfig: { config: ['table', 'topic'] },
        }).entityReferenceConfig,
      ).toEqual(['table', 'topic']);
    });
  });

  describe('updateCustomPropertyByName (official PATCH edit)', () => {
    const typeWith = (properties: CustomPropertyDef[]) => ({
      id: 'tid',
      name: 'table',
      customProperties: properties.map((p) => ({
        ...p,
        propertyType: { name: p.propertyType },
        ...(p.customPropertyConfig ? { customPropertyConfig: p.customPropertyConfig } : {}),
      })),
    });

    function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
      return fetchMock.mock.calls.filter(
        ([, init]) => String((init as RequestInit | undefined)?.method || '').toUpperCase() === 'PATCH',
      );
    }

    it('PATCHes test+replace by index for changed fields only', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(init?.method || '').toUpperCase() === 'PATCH') {
          return new Response(
            JSON.stringify(
              typeWith([
                {
                  name: 'tier',
                  displayName: 'Tier',
                  description: 'new',
                  propertyType: 'enum',
                  customPropertyConfig: { config: { values: ['gold', 'silver'], multiSelect: true } },
                },
              ]),
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify(
            typeWith([
              {
                name: 'tier',
                displayName: 'Tier',
                description: 'old',
                propertyType: 'enum',
                customPropertyConfig: { config: { values: ['gold'], multiSelect: false } },
              },
            ]),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      const updated = await updateCustomPropertyByName('table', 'tier', {
        displayName: undefined,
        description: 'new',
        customPropertyConfig: { config: { multiSelect: true, values: ['gold', 'silver'] } },
      });
      expect(updated?.customProperties[0]?.description).toBe('new');
      const calls = patchCalls(fetchMock);
      expect(calls).toHaveLength(1);
      expect(JSON.parse(String((calls[0]![1] as RequestInit).body))).toEqual([
        { op: 'test', path: '/customProperties/0/name', value: 'tier' },
        { op: 'replace', path: '/customProperties/0/description', value: 'new' },
        {
          op: 'replace',
          path: '/customProperties/0/customPropertyConfig',
          value: { config: { multiSelect: true, values: ['gold', 'silver'] } },
        },
      ]);
    });

    it('adds a field the server copy lacks and sends only the test op when nothing changed', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(init?.method || '').toUpperCase() === 'PATCH') {
          return new Response(JSON.stringify(typeWith([{ name: 'tier', description: 'd', propertyType: 'enum' }])), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify(typeWith([{ name: 'tier', description: 'd', propertyType: 'enum' }])),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      await updateCustomPropertyByName('table', 'tier', {
        displayName: 'Tier',
        description: 'd',
      });
      const calls = patchCalls(fetchMock);
      expect(JSON.parse(String((calls[0]![1] as RequestInit).body))).toEqual([
        { op: 'test', path: '/customProperties/0/name', value: 'tier' },
        { op: 'add', path: '/customProperties/0/displayName', value: 'Tier' },
      ]);
      await updateCustomPropertyByName('table', 'tier', {
        displayName: undefined,
        description: 'd',
      });
      const second = patchCalls(fetchMock)[1]!;
      expect(JSON.parse(String((second[1] as RequestInit).body))).toEqual([
        { op: 'test', path: '/customProperties/0/name', value: 'tier' },
      ]);
    });

    it('rebuilds the patch after a stale-index 400 and resolves undefined when gone', async () => {
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
          return new Response(
            JSON.stringify(typeWith([{ name: 'tier', description: 'new', propertyType: 'enum' }])),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify(
            typeWith(
              patchCount === 0
                ? [
                    { name: 'other', description: 'd', propertyType: 'string' },
                    { name: 'tier', description: 'old', propertyType: 'enum' },
                  ]
                : [{ name: 'tier', description: 'old', propertyType: 'enum' }],
            ),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      const updated = await updateCustomPropertyByName('table', 'tier', {
        displayName: undefined,
        description: 'new',
      });
      expect(updated?.customProperties[0]?.description).toBe('new');
      const calls = patchCalls(fetchMock);
      expect(calls).toHaveLength(2);
      expect(JSON.parse(String((calls[1]![1] as RequestInit).body))).toEqual([
        { op: 'test', path: '/customProperties/0/name', value: 'tier' },
        { op: 'replace', path: '/customProperties/0/description', value: 'new' },
      ]);
      const goneMock = vi.fn(async () =>
        new Response(JSON.stringify(typeWith([])), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', goneMock);
      await expect(
        updateCustomPropertyByName('table', 'tier', { displayName: undefined, description: 'new' }),
      ).resolves.toBeUndefined();
      expect(patchCalls(goneMock)).toHaveLength(0);
    });
  });

  describe('startCase (lodash equivalent)', () => {
    it('capitalizes every word, splitting camelCase and separators', () => {
      // Discriminator: lodash "Foo Bar", not the old "Foo bar".
      expect(startCase('foo_bar')).toBe('Foo Bar');
      expect(startCase('fooBar')).toBe('Foo Bar');
      expect(startCase('mlmodels')).toBe('Mlmodels');
      expect(startCase('databaseSchema')).toBe('Database Schema');
      expect(startCase('apiCollections')).toBe('Api Collections');
      expect(startCase('tableColumn')).toBe('Table Column');
      expect(startCase('dashboardDataModel')).toBe('Dashboard Data Model');
      expect(startCase('my-type')).toBe('My Type');
      expect(startCase('FOO_BAR')).toBe('FOO BAR');
      expect(startCase('')).toBe('');
    });
  });

  describe('getEntityName', () => {
    it('prefers displayName, falls back to name, then empty', () => {
      expect(getEntityName({ name: 'tier', displayName: 'Tier' })).toBe('Tier');
      expect(getEntityName({ name: 'tier' })).toBe('tier');
      expect(getEntityName({})).toBe('');
    });
  });

  describe('customPropertySorter (official columnSorter)', () => {
    it('sorts by entity name (displayName wins)', () => {
      const defs: CustomPropertyDef[] = [
        { name: 'zeta' },
        { name: 'alpha', displayName: 'Omega' },
        { name: 'mmm', displayName: 'AAA' },
      ];
      expect([...defs].sort(customPropertySorter).map((d) => d.name)).toEqual([
        'mmm',
        'alpha',
        'zeta',
      ]);
      expect(
        [{ name: 'aaa', displayName: 'zzz' }, { name: 'mmm' }].sort(customPropertySorter)[0]?.name,
      ).toBe('mmm');
    });
  });

  describe('getPropertyTypeBadge (official badge table)', () => {
    it('maps all 17 property types to color roles and label keys', () => {
      const expected: [string, string, string, boolean][] = [
        ['string', 'gray-blue', 'label.string', false],
        ['integer', 'blue-light', 'label.integer', false],
        ['number', 'blue-light', 'label.number', false],
        ['email', 'pink', 'label.email', false],
        ['date-cp', 'orange', 'label.date', false],
        ['dateTime-cp', 'orange', 'label.date-and-time', false],
        ['time-cp', 'orange', 'label.time', false],
        ['timestamp', 'warning', 'label.timestamp', false],
        ['duration', 'warning', 'label.duration', false],
        ['enum', 'purple', 'label.enum', false],
        ['hyperlink-cp', 'blue', 'label.hyperlink', false],
        ['entityReference', 'indigo', 'label.entity-ref', false],
        ['entityReferenceList', 'indigo', 'label.entity-ref-list', false],
        ['timeInterval', 'brand', 'label.time-interval', true],
        ['table-cp', 'error', 'label.table', true],
        ['sqlQuery', 'success', 'label.sql-uppercase', true],
        ['markdown', 'gray', 'label.markdown', true],
      ];
      for (const [name, color, labelKey, isWide] of expected) {
        expect(getPropertyTypeBadge(name)).toEqual({
          color,
          labelKey,
          fallbackLabel: '',
          isWide,
        });
      }
    });

    it('falls back to default gray with a startCase label for unmapped types', () => {
      expect(getPropertyTypeBadge('myCustom-cp')).toEqual({
        color: 'gray',
        labelKey: undefined,
        fallbackLabel: 'My Custom',
        isWide: false,
      });
      expect(getPropertyTypeBadge(undefined)).toEqual({
        color: 'gray',
        labelKey: undefined,
        fallbackLabel: '',
        isWide: false,
      });
    });
  });

  describe('getCustomPropertyPageHeader (official 26-entry table)', () => {
    it('returns the pin header keys per entity type', () => {
      const expected: [string, string, string | undefined][] = [
        ['table', 'label.table-plural', 'label.table-plural'],
        ['topic', 'label.topic-plural', 'label.topic-plural'],
        ['dashboard', 'label.dashboard-plural', 'label.dashboard-plural'],
        ['dashboardDataModel', 'label.dashboard-data-model-plural', 'label.dashboard-data-model-plural'],
        ['dataProduct', 'label.data-product-plural', 'label.data-product-plural'],
        ['pipeline', 'label.pipeline-plural', 'label.pipeline-plural'],
        ['mlmodel', 'label.ml-model-plural', 'label.ml-model-plural'],
        ['container', 'label.container-plural', 'label.container-plural'],
        ['storedProcedure', 'label.stored-procedure-plural', 'label.stored-procedure-plural'],
        ['domain', 'label.domain-plural', 'label.domain-plural'],
        ['searchIndex', 'label.search-index-plural', 'label.search-index-plural'],
        ['glossaryTerm', 'label.glossary-term', 'label.glossary-term'],
        ['database', 'label.database', 'label.database'],
        ['databaseSchema', 'label.database-schema', 'label.database-schema'],
        ['apiCollection', 'label.api-collection-plural', 'label.api-collection-plural'],
        ['apiEndpoint', 'label.api-endpoint-plural', 'label.api-endpoint-plural'],
        ['metric', 'label.metric-plural', 'label.metric-plural'],
        ['chart', 'label.chart-plural', 'label.chart-plural'],
        ['directory', 'label.directory-plural', 'label.directory-plural'],
        ['file', 'label.file-plural', 'label.file-plural'],
        ['spreadsheet', 'label.spreadsheet-plural', 'label.spreadsheet-plural'],
        ['worksheet', 'label.worksheet-plural', 'label.worksheet-plural'],
        ['team', 'label.team-plural', 'label.team-plural'],
        ['page', 'label.article-plural', 'label.article-plural'],
        ['tableColumn', 'label.column-plural', undefined],
        ['user', 'label.user-plural', 'label.user-plural'],
      ];
      expect(expected).toHaveLength(26);
      for (const [type, headerKey, subHeaderEntityKey] of expected) {
        const header = getCustomPropertyPageHeader(type);
        expect(header.headerKey).toBe(headerKey);
        if (subHeaderEntityKey === undefined) {
          expect(header.subHeaderKey).toBe('message.define-custom-property-for-column');
          expect(header.subHeaderEntityKey).toBeUndefined();
        } else {
          expect(header.subHeaderKey).toBe('message.define-custom-property-for-entity');
          expect(header.subHeaderEntityKey).toBe(subHeaderEntityKey);
        }
      }
    });

    it('falls back to the Tables header for unmapped types', () => {
      expect(getCustomPropertyPageHeader('somethingNew')).toEqual(
        getCustomPropertyPageHeader('table'),
      );
    });
  });

  describe('getCustomPropertyRouteSegment (reverse ENTITY_PATH)', () => {
    it('maps all 26 entity types to their route segments', () => {
      const expected: [string, string][] = [
        ['table', 'tables'],
        ['topic', 'topics'],
        ['dashboard', 'dashboards'],
        ['dashboardDataModel', 'dashboardDataModels'],
        ['dataProduct', 'dataProducts'],
        ['pipeline', 'pipelines'],
        ['mlmodel', 'mlmodels'],
        ['container', 'containers'],
        ['storedProcedure', 'storedProcedures'],
        ['domain', 'domains'],
        ['searchIndex', 'searchIndexes'],
        ['glossaryTerm', 'glossaryTerm'],
        ['database', 'databases'],
        ['databaseSchema', 'databaseSchemas'],
        ['apiCollection', 'apiCollections'],
        ['apiEndpoint', 'apiEndpoints'],
        ['metric', 'metrics'],
        ['chart', 'charts'],
        ['directory', 'directories'],
        ['file', 'files'],
        ['spreadsheet', 'spreadsheets'],
        ['worksheet', 'worksheets'],
        ['team', 'teams'],
        ['page', 'articles'],
        ['tableColumn', 'column'],
        ['user', 'users'],
      ];
      expect(expected).toHaveLength(26);
      for (const [type, segment] of expected) {
        expect(getCustomPropertyRouteSegment(type)).toBe(segment);
      }
      expect(getCustomPropertyRouteSegment('somethingNew')).toBe('somethingNew');
    });
  });

  describe('docs link', () => {
    it('uses the official ADD_CUSTOM_PROPERTIES_DOCS URL', () => {
      expect(ADD_CUSTOM_PROPERTIES_DOCS).toBe(
        'https://docs.open-metadata.org/latest/how-to-guides/guide-for-data-users/custom',
      );
    });
  });
});
