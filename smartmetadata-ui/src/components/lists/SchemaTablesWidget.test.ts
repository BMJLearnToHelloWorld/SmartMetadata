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
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { SchemaTableRow } from '@/api/tables';
import SchemaTablesWidget from './SchemaTablesWidget.vue';

const { listTablesMock, patchTableDetailsMock, searchAssetsMock, getResourcePermissionMock } = vi.hoisted(() => ({
  listTablesMock: vi.fn(),
  patchTableDetailsMock: vi.fn(),
  searchAssetsMock: vi.fn(),
  getResourcePermissionMock: vi.fn(),
}));

vi.mock('@/api/tables', () => ({
  listTables: listTablesMock,
  patchTableDetails: patchTableDetailsMock,
}));

vi.mock('@/api/search', () => ({
  searchAssets: searchAssetsMock,
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: false,
    getResourcePermission: getResourcePermissionMock,
    getEntityPermissionById: vi.fn(),
    getEntityPermissionByFqn: vi.fn(),
  }),
}));

const ROWS: SchemaTableRow[] = [
  {
    id: 't1',
    name: 'orders',
    displayName: 'Orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    description: 'Order lines',
    owners: [{ name: 'alice', displayName: 'Alice' }],
    domains: [],
    dataProducts: [],
    tags: [
      { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual' },
    ],
  },
  {
    id: 't2',
    name: 'customers',
    fullyQualifiedName: 'svc.db.schema.customers',
    owners: [],
    domains: [],
    dataProducts: [],
    tags: [],
  },
];

async function mountWidget(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div />' } },
      { path: '/bulk/edit/:entityType/:fqn', name: 'bulk-edit', component: { template: '<div />' } },
    ],
  });
  await router.push('/asset/databaseSchema/svc.db.schema');
  await router.isReady();
  const wrapper = mount(SchemaTablesWidget, {
    props: { schemaFqn: 'svc.db.schema', canView: true, ...props },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('SchemaTablesWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    listTablesMock.mockResolvedValue({ data: ROWS, total: 2 });
    patchTableDetailsMock.mockImplementation(async (_fqn: string) => ({
      ...ROWS[0],
      displayName: 'Orders (renamed)',
    }));
    searchAssetsMock.mockResolvedValue({ total: 0, hits: [] });
    getResourcePermissionMock.mockResolvedValue({ ViewBasic: true, EditDisplayName: true, EditAll: true });
  });

  it('fetches nothing while the view gate is unresolved and lists tables once it is true', async () => {
    const { wrapper } = await mountWidget({ canView: null });
    expect(listTablesMock).not.toHaveBeenCalled();
    expect(wrapper.find('.ant-table-placeholder').exists()).toBe(true);
    wrapper.unmount();

    const mounted = await mountWidget({ canView: true });
    expect(listTablesMock).toHaveBeenCalledWith({
      databaseSchema: 'svc.db.schema',
      limit: 10,
      include: 'non-deleted',
    });
    expect(mounted.wrapper.text()).toContain('Orders');
    expect(mounted.wrapper.text()).toContain('Order lines');
    expect(mounted.wrapper.text()).toContain('Alice');
    expect(mounted.wrapper.text()).toContain('Email');
    expect(mounted.wrapper.text()).toContain('Tier1');
    mounted.wrapper.unmount();
  });

  it('searches the table index with the schema keyword filter', async () => {
    vi.useFakeTimers();
    const { wrapper } = await mountWidget();
    searchAssetsMock.mockResolvedValue({
      total: 1,
      hits: [
        {
          id: 't1',
          name: 'orders',
          displayName: 'Orders',
          fullyQualifiedName: 'svc.db.schema.orders',
          entityType: 'table',
          description: 'Order lines',
          owners: [],
          tags: [],
        },
      ],
    });
    const input = wrapper.find('[data-testid="search-tables-input"]');
    await input.setValue('orders');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    const filter = JSON.parse(searchAssetsMock.mock.calls[0][3].query_filter as string);
    expect(filter).toEqual({
      bool: {
        must: [
          { term: { 'databaseSchema.fullyQualifiedName.keyword': 'svc.db.schema' } },
          {
            bool: {
              should: [
                { wildcard: { 'displayName.keyword': '*orders*' } },
                { wildcard: { 'name.keyword': '*orders*' } },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
    });
    expect(wrapper.text()).toContain('Orders');
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('edits the display name inline when the derived flag grants it', async () => {
    const { wrapper } = await mountWidget();
    const editButton = wrapper.find('[data-testid="edit-display-name-orders"]');
    expect(editButton.exists()).toBe(true);
    await editButton.trigger('click');
    const input = wrapper.find('.lists-widget__name-edit input');
    await input.setValue('Orders (renamed)');
    await wrapper.find('.lists-widget__name-edit .ant-btn-link').trigger('click');
    await flushPromises();
    expect(patchTableDetailsMock).toHaveBeenCalledWith(
      'svc.db.schema.orders',
      [{ op: 'replace', path: '/displayName', value: 'Orders (renamed)' }],
    );
    expect(wrapper.text()).toContain('Orders (renamed)');
    wrapper.unmount();
  });

  it('hides the display-name edit and the bulk-edit button without permission', async () => {
    getResourcePermissionMock.mockResolvedValue({ ViewBasic: true });
    const { wrapper } = await mountWidget();
    expect(wrapper.find('[data-testid="edit-display-name-orders"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bulk-edit-table"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the bulk-edit button with EditAll and navigates to the bulk-edit route', async () => {
    const { wrapper, router } = await mountWidget();
    const bulkButton = wrapper.find('[data-testid="bulk-edit-table"]');
    expect(bulkButton.exists()).toBe(true);
    await bulkButton.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('bulk-edit');
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'table', fqn: 'svc.db.schema' });
    wrapper.unmount();
  });

  it('keeps the display-name edit hidden on a deleted schema', async () => {
    const { wrapper } = await mountWidget({ deleted: true });
    expect(wrapper.find('[data-testid="edit-display-name-orders"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
