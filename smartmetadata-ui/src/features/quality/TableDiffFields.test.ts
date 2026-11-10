/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { InputNumber, Select, Switch } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TableDiffFields from './TableDiffFields.vue';

const DEFINITIONS = [
  { name: 'keyColumns', displayName: "Table 1's key columns", dataType: 'ARRAY' },
  { name: 'table2', displayName: 'Table 2', dataType: 'STRING', required: true },
  { name: 'table2.keyColumns', displayName: "Table 2's key columns", dataType: 'ARRAY' },
  { name: 'threshold', displayName: 'Threshold', dataType: 'NUMBER' },
  { name: 'useColumns', displayName: 'Use Columns', dataType: 'ARRAY' },
  { name: 'where', displayName: 'SQL Where Clause', dataType: 'STRING' },
  { name: 'caseSensitiveColumns', displayName: 'Case sensitive columns', dataType: 'BOOLEAN' },
  { name: 'parallelQueries', displayName: 'Parallel queries per database', dataType: 'NUMBER' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tableHit(fqn: string) {
  return {
    _index: 'table_search_index',
    _source: { fullyQualifiedName: fqn, displayName: fqn.split('.').at(-1), name: fqn.split('.').at(-1) },
  };
}

function mountFields(modelValue: Record<string, string> = {}) {
  return mount(TableDiffFields, {
    props: {
      definitions: DEFINITIONS,
      modelValue,
      entityFqn: 'svc.db.schema.orders',
      entityType: 'table',
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('TableDiffFields (P2-6)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({
            hits: {
              total: { value: 1 },
              hits: [tableHit('svc.db.schema.orders_copy')],
            },
          });
        }
        if (url.includes('/api/v1/tables/name/svc.db.schema.orders_copy')) {
          return jsonResponse({
            fullyQualifiedName: 'svc.db.schema.orders_copy',
            name: 'orders_copy',
            columns: [
              { name: 'id', dataType: 'INT' },
              { name: 'code', dataType: 'STRING' },
            ],
          });
        }
        if (url.includes('/api/v1/tables/name/')) {
          return jsonResponse({
            fullyQualifiedName: 'svc.db.schema.orders',
            name: 'orders',
            columns: [
              { name: 'id', dataType: 'INT' },
              { name: 'code', dataType: 'STRING' },
              { name: 'amount', dataType: 'DOUBLE' },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function selects(wrapper: ReturnType<typeof mountFields>) {
    return wrapper.findAllComponents(Select);
  }

  it('renders one control per declared parameter; table2 key columns stay disabled until table2 is picked', async () => {
    const wrapper = mountFields();
    await flushPromises();
    for (const name of ['keyColumns', 'table2', 'table2.keyColumns', 'threshold', 'useColumns', 'where', 'caseSensitiveColumns', 'parallelQueries']) {
      expect(wrapper.find(`[data-testid="table-diff-param-${name}"]`).exists()).toBe(true);
    }
    const table2KeyColumns = selects(wrapper)[2];
    expect(table2KeyColumns.props('disabled')).toBe(true);
  });

  it('loads table1 columns for the key/use lists and table2 columns once table2 is set', async () => {
    const mockedFetch = vi.mocked(fetch);
    const wrapper = mountFields({ table2: 'svc.db.schema.orders_copy' });
    await flushPromises();
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tables/name/svc.db.schema.orders'),
      expect.anything(),
    );
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tables/name/svc.db.schema.orders_copy'),
      expect.anything(),
    );
    expect(selects(wrapper)[2].props('disabled')).toBe(false);
  });

  it('emits array parameters as a JSON array string', async () => {
    const wrapper = mountFields();
    await flushPromises();
    (selects(wrapper)[0].vm as unknown as { $emit: (event: string, value: unknown) => void }).$emit('change', ['id', 'code']);
    await flushPromises();
    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as Record<string, string> | undefined;
    expect(emitted?.keyColumns).toBe('["id","code"]');
  });

  it('clears table2 key columns when table2 is swapped', async () => {
    const wrapper = mountFields({
      table2: 'svc.db.schema.orders_copy',
      'table2.keyColumns': '["id"]',
    });
    await flushPromises();
    (selects(wrapper)[1].vm as unknown as { $emit: (event: string, value: unknown) => void }).$emit('change', 'svc.db.schema.orders_other');
    await flushPromises();
    const first = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as Record<string, string>;
    expect(first.table2).toBe('svc.db.schema.orders_other');
    await wrapper.setProps({ modelValue: first });
    await flushPromises();
    const emitted = wrapper.emitted('update:modelValue') ?? [];
    expect(emitted.some((args) => (args[0] as Record<string, string>)['table2.keyColumns'] === '')).toBe(true);
  });

  it('excludes key columns from the use-columns options and vice versa', async () => {
    const wrapper = mountFields({ keyColumns: '["id"]' });
    await flushPromises();
    const useColumnsOptions = selects(wrapper)[3].props('options') as Array<{ value: string }>;
    expect(useColumnsOptions.map((option) => option.value)).toEqual(['code', 'amount']);
    const keyColumnsOptions = selects(wrapper)[0].props('options') as Array<{ value: string }>;
    expect(keyColumnsOptions.map((option) => option.value)).toEqual(['code', 'amount']);
  });

  it('emits number and boolean parameters as strings', async () => {
    const wrapper = mountFields();
    await flushPromises();
    const numbers = wrapper.findAllComponents(InputNumber);
    (numbers[0].vm as unknown as { $emit: (event: string, value: unknown) => void }).$emit('change', 5);
    await flushPromises();
    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as Record<string, string> | undefined;
    expect(emitted?.threshold).toBe('5');
    const switches = wrapper.findAllComponents(Switch);
    (switches[0].vm as unknown as { $emit: (event: string, value: unknown) => void }).$emit('change', true);
    await flushPromises();
    const emitted2 = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as Record<string, string> | undefined;
    expect(emitted2?.caseSensitiveColumns).toBe('true');
  });

  it('shows a hint instead of blocking input when table1 columns fail to load', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/tables/name/svc.db.schema.orders?') || url.includes('/api/v1/tables/name/svc.db.schema.orders%3F')) {
        return new Response('not found', { status: 404 });
      }
      if (url.includes('/api/v1/search/query')) {
        return jsonResponse({ hits: { total: { value: 0 }, hits: [] } });
      }
      return new Response('not found', { status: 404 });
    });
    const wrapper = mountFields();
    await flushPromises();
    expect(wrapper.text()).toContain('Columns could not be loaded for this table');
  });
});
