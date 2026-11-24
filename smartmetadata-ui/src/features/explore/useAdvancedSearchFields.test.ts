/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldsForSearchIndex } from '@/catalog/advancedSearchFields';
import { useAdvancedSearchFields } from './useAdvancedSearchFields';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useAdvancedSearchFields', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/metadata/types')) {
          return jsonResponse({
            data: [
              {
                name: 'table',
                customProperties: [
                  { name: 'retentionDays', propertyType: { name: 'integer' } },
                  { name: 'sensitivity', propertyType: { name: 'enum' }, customPropertyConfig: { config: { values: ['low', 'high'] } } },
                ],
              },
            ],
          });
        }
        if (url.includes('/v1/search/aggregate')) {
          return jsonResponse({
            aggregations: {
              'sterms#ownerDisplayName': { buckets: [{ key: 'Data Eng', doc_count: 3 }] },
            },
          });
        }
        return jsonResponse({}, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads server custom properties as extension fields', async () => {
    const fields = useAdvancedSearchFields();
    await fields.loadCustomPropertyFields();
    expect(fields.customPropertiesLoaded.value).toBe(true);
    const tabFields = fields.fieldsForTab('table');
    const keys = tabFields.map((field) => field.key);
    expect(keys).toContain('extension.table.retentionDays');
    expect(keys).toContain('extension.table.sensitivity.keyword');
    const sensitivity = tabFields.find((field) => field.key === 'extension.table.sensitivity.keyword');
    expect(sensitivity?.type).toBe('multiselect');
    expect(sensitivity?.listValues?.map((option) => option.value)).toEqual(['low', 'high']);
    // Base fields are still present alongside the extension group.
    expect(keys).toContain('ownerDisplayName');
  });

  it('fetches select options from the aggregate endpoint', async () => {
    const fields = useAdvancedSearchFields();
    const owner = fieldsForSearchIndex('table').find((field) => field.key === 'ownerDisplayName');
    expect(owner).toBeDefined();
    const options = await fields.fetchFieldOptions(owner!, 'Data', 'table');
    expect(options).toEqual([{ value: 'Data Eng', label: 'Data Eng' }]);
  });

  it('returns an empty list when the aggregate endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'boom' }, 500)));
    const fields = useAdvancedSearchFields();
    const owner = fieldsForSearchIndex('table').find((field) => field.key === 'ownerDisplayName');
    const options = await fields.fetchFieldOptions(owner!, '', 'table');
    expect(options).toEqual([]);
  });

  it('keeps the builder usable when the custom-property endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'boom' }, 500)));
    const fields = useAdvancedSearchFields();
    await fields.loadCustomPropertyFields();
    expect(fields.customPropertiesLoaded.value).toBe(true);
    expect(fields.customPropertyFields.value).toEqual([]);
    expect(fields.fieldsForTab('table').map((field) => field.key)).toContain('ownerDisplayName');
  });
});
