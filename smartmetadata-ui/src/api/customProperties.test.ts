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
  buildCustomPropertyConfig,
  deleteCustomPropertyByName,
  filterCustomProperties,
  getCustomPropertyChanges,
  getCustomPropertyTypeFlags,
  getEditFormValues,
  getMetadataTypeByName,
  getPropertyConfigSummary,
  getPropertyTypeOptions,
  listCustomProperties,
  listMetadataTypes,
  listPropertyTypes,
  mapCustomProperty,
  mapMetadataType,
  propertyTypeLabel,
  toCustomPropertyPayload,
  updateCustomPropertyByName,
  validateCustomPropertyForm,
  TYPE_FIELDS,
  type CustomPropertyDef,
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
      expect(
        buildCustomPropertyConfig(
          { enumConfig: ['gold', 'silver', 'gold'], multiSelect: true },
          getCustomPropertyTypeFlags('enum'),
        ),
      ).toEqual({ config: { multiSelect: true, values: ['gold', 'silver'] } });
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
      ).toEqual({ config: { columns: ['a', 'b'] } });
      expect(
        buildCustomPropertyConfig({}, getCustomPropertyTypeFlags('string')),
      ).toBeUndefined();
      expect(
        buildCustomPropertyConfig({}, getCustomPropertyTypeFlags('date-cp')),
      ).toBeUndefined();
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
        propertyType: { id: 'f-enum', type: 'type', name: 'enum' },
        customPropertyConfig: { config: { multiSelect: false, values: ['gold'] } },
      });
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
        propertyType: { id: 'f-str', type: 'type', name: 'string' },
        displayName: 'Note',
      });
      expect('customPropertyConfig' in plain).toBe(false);
    });

    it('labels property types per official (sqlQuery special-cased, -cp stripped)', () => {
      expect(propertyTypeLabel('sqlQuery', 'SQL query', 'SQL Query')).toBe('SQL Query');
      expect(propertyTypeLabel('date-cp', undefined, 'SQL Query')).toBe('Date');
      expect(propertyTypeLabel('date-cp', 'My Date', 'SQL Query')).toBe('My Date');
      expect(propertyTypeLabel('entityReference', undefined, 'SQL Query')).toBe('Entity Reference');
    });
  });

  describe('validateCustomPropertyForm (official form rules)', () => {
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
      expect(validateCustomPropertyForm(base, { existingNames: [], isEdit: false })).toEqual([]);
    });

    it('rejects an empty, too-long, or invalid name', () => {
      expect(
        validateCustomPropertyForm({ ...base, name: '' }, { existingNames: [], isEdit: false })[0]?.key,
      ).toBe('settings.customProperties.nameRequired');
      expect(
        validateCustomPropertyForm(
          { ...base, name: 'a'.repeat(257) },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.nameLength');
      expect(
        validateCustomPropertyForm(
          { ...base, name: 'bad"name' },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.nameInvalid');
      // The regex allows a leading digit and spaces inside.
      expect(
        validateCustomPropertyForm(
          { ...base, name: '9 lives ok' },
          { existingNames: [], isEdit: false },
        ),
      ).toEqual([]);
    });

    it('rejects a case-insensitively duplicate name on create but not on edit', () => {
      expect(
        validateCustomPropertyForm(
          { ...base, name: 'Tier' },
          { existingNames: ['tier'], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.nameExists');
      expect(
        validateCustomPropertyForm(
          { ...base, name: 'Tier' },
          { existingNames: ['tier'], isEdit: true },
        ),
      ).toEqual([]);
    });

    it('rejects a missing description or property type', () => {
      expect(
        validateCustomPropertyForm(
          { ...base, description: '' },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.descriptionRequired');
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: '' },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.propertyTypeRequired');
    });

    it('requires each conditional field for its type', () => {
      expect(
        validateCustomPropertyForm(
          { ...base, enumConfig: [] },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.enumValuesRequired');
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'date-cp' },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.formatRequired');
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'date-cp', formatConfig: 'yyyy-MM-dd HH:mm' },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.formatInvalid');
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'entityReference' },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.entityReferenceRequired');
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'table-cp' },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.columnsRequired');
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'table-cp', columns: ['a', 'b', 'c', 'd'] },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.columnsTooMany');
      expect(
        validateCustomPropertyForm(
          { ...base, propertyTypeName: 'table-cp', columns: ['__row_id__'] },
          { existingNames: [], isEdit: false },
        ).map((issue) => issue.key),
      ).toContain('settings.customProperties.columnReserved');
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
});
