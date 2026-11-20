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
import Antd, { Select } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { searchAssets } from '@/api/search';
import { QUERY_FILTER_PAGE_SIZE } from '@/catalog/queryFilter';
import { createTestI18n } from '@/test/i18n';
import type { EntityRef } from '@/types/api';
import QueryUsedByOtherTable from './QueryUsedByOtherTable.vue';

vi.mock('@/api/search', async () => {
  // Keep the real escapeESReservedCharacters: the component must wire the
  // real escaper into the picker query (N-01). Only the network call is
  // stubbed.
  const actual = await vi.importActual<typeof import('@/api/search')>('@/api/search');
  return {
    ...actual,
    searchAssets: vi.fn(async () => ({
      total: 1,
      hits: [
        {
          id: 't5',
          name: 'staging',
          fullyQualifiedName: 'svc.db.schema.staging',
          entityType: 'table',
          owners: [],
          tags: [],
          domains: [],
          dataProducts: [],
        },
      ],
      facets: [],
    })),
  };
});

const TABLES: EntityRef[] = [
  { id: 't1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' },
  { id: 't2', type: 'table', name: 'customers', fullyQualifiedName: 'svc.db.schema.customers' },
  { id: 't3', type: 'table', name: 'accounts', fullyQualifiedName: 'svc.db.schema.accounts' },
  { id: 't4', type: 'table', name: 'returns', fullyQualifiedName: 'svc.db.schema.returns' },
];

async function mountFooter(queryUsedIn: EntityRef[], isEditMode: boolean, selectedTables: EntityRef[] = []) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div />' } }],
  });
  await router.push('/asset/table/svc.db.schema.orders');
  await router.isReady();
  const wrapper = mount(QueryUsedByOtherTable, {
    props: { queryUsedIn, isEditMode, selectedTables },
    attachTo: document.body,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('QueryUsedByOtherTable', () => {
  it('links the first 3 tables and offers the rest behind and-N-more', async () => {
    const wrapper = await mountFooter(TABLES, false);
    expect(wrapper.text()).toContain('Query used by other tables:');
    expect(wrapper.text()).toContain('orders');
    expect(wrapper.text()).toContain('customers');
    expect(wrapper.text()).toContain('accounts');
    expect(wrapper.text()).not.toContain('returns');
    expect(wrapper.text()).toContain('and 1 more');
    const links = wrapper.findAll('a');
    expect(links.map((link) => link.text())).toEqual(['orders', 'customers', 'accounts']);
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/asset/table/svc.db.schema.orders',
      '/asset/table/svc.db.schema.customers',
      '/asset/table/svc.db.schema.accounts',
    ]);
    wrapper.unmount();
  });

  it('lists the remaining tables in the popover with parent-table links', async () => {
    const wrapper = await mountFooter(TABLES, false);
    const trigger = wrapper.find('.query-used-by button');
    await trigger.trigger('mouseenter');
    await new Promise((resolve) => setTimeout(resolve, 250));
    await flushPromises();
    const popover = document.body.querySelector('.ant-popover-inner-content');
    expect(popover?.textContent).toContain('returns');
    expect(popover?.querySelector('a')?.getAttribute('href')).toBe(
      '/asset/table/svc.db.schema.returns',
    );
    wrapper.unmount();
  });

  it('renders the label and a dash when the query is used by no table', async () => {
    const wrapper = await mountFooter([], false);
    expect(wrapper.text()).toContain('Query used by other tables:');
    expect(wrapper.text()).toContain('--');
    wrapper.unmount();
  });

  it('searches tables on mount in edit mode and emits refs for the selection', async () => {
    const wrapper = await mountFooter(TABLES, true, [TABLES[0]!]);
    expect(searchAssets).toHaveBeenCalledWith('*', 0, QUERY_FILTER_PAGE_SIZE, { index: 'table' });
    const select = wrapper.find('[data-testid="edit-query-used-in"]');
    expect(select.exists()).toBe(true);
    expect(wrapper.findComponent(Select).props('placeholder')).toBe('Please Select a Query Used In');
    expect(wrapper.text()).toContain('Query used by other tables:');
    // The mount search offered the staging table; selecting it emits the
    // full EntityRef (with id) the patch payload needs.
    await wrapper.findComponent(Select).vm.$emit('change', ['svc.db.schema.staging']);
    expect(wrapper.emitted('update:selectedTables')).toEqual([
      [[{ id: 't5', type: 'table', name: 'staging', fullyQualifiedName: 'svc.db.schema.staging' }]],
    ]);
    wrapper.unmount();
  });

  it('escapes ES reserved characters in typed picker text (N-01)', async () => {
    const wrapper = await mountFooter(TABLES, true, [TABLES[0]!]);
    expect(searchAssets).toHaveBeenCalledWith('*', 0, QUERY_FILTER_PAGE_SIZE, { index: 'table' });
    // `a+b (c)` carries reserved `+`, `(`, `)`; the pin hook sends them
    // backslash-escaped inside the `*...*` wrap.
    await wrapper.findComponent(Select).vm.$emit('search', 'a+b (c)');
    await flushPromises();
    expect(searchAssets).toHaveBeenCalledWith(
      '*a\\+b \\(c\\)*',
      0,
      QUERY_FILTER_PAGE_SIZE,
      { index: 'table' },
    );
    wrapper.unmount();
  });
});
