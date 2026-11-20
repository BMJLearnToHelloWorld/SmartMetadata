/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AddQueryView from './AddQueryView.vue';

const mocks = vi.hoisted(() => ({
  postQuery: vi.fn(async (_body: unknown) => ({ id: 'q9', query: 'select 1', service: 'warehouse' })),
  getResourcePermission: vi.fn(async () => ({
    permissions: [{ operation: 'Create', access: 'allow' }],
  })),
  fetchLoggedInUser: vi.fn(async () => ({ id: 'u1', name: 'alice' })),
  searchAssets: vi.fn(async () => ({ total: 0, hits: [], facets: [] })),
}));

const postQueryMock = mocks.postQuery;

vi.mock('@/api/queries', () => ({
  postQuery: (body: unknown) => mocks.postQuery(body),
}));

vi.mock('@/api/permissions', () => ({
  getResourcePermission: mocks.getResourcePermission,
  toOperationPermissions: (permission: { permissions?: Array<{ operation: string; access: string }> }) => {
    const result: Record<string, boolean> = {};
    for (const entry of permission?.permissions ?? []) {
      result[entry.operation] = entry.access === 'allow';
    }
    return result;
  },
}));

vi.mock('@/api/auth', () => ({
  fetchLoggedInUser: mocks.fetchLoggedInUser,
}));

vi.mock('@/api/search', () => ({
  searchAssets: mocks.searchAssets,
}));

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/query-view/:fqn/:queryId',
        name: 'query-full-screen',
        component: { template: '<div>full screen</div>' },
        props: true,
      },
    ],
  });
  const wrapper = mount(AddQueryView, {
    props: { fqn: 'warehouse.db.schema.orders' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('AddQueryView', () => {
  it('posts the official CreateQuery payload: query, service, owners, queryDate (A16)', async () => {
    const { wrapper, router } = await mountView();
    expect((wrapper.find('[data-testid="add-query-save"]').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.find('[data-testid="add-query-sql"]').setValue('select 1');
    await flushPromises();
    expect((wrapper.find('[data-testid="add-query-save"]').element as HTMLButtonElement).disabled).toBe(false);
    await wrapper.find('[data-testid="add-query-save"]').trigger('click');
    await flushPromises();
    expect(postQueryMock).toHaveBeenCalledTimes(1);
    const body = postQueryMock.mock.calls[0]![0] as {
      query: string;
      service: string;
      owners?: Array<{ id: string; type: string }>;
      queryDate?: number;
    };
    expect(body.query).toBe('select 1');
    expect(body.service).toBe('warehouse');
    expect(body.owners).toEqual([{ id: 'u1', type: 'user' }]);
    expect(typeof body.queryDate).toBe('number');
    expect(router.currentRoute.value.name).toBe('query-full-screen');
    wrapper.unmount();
  });

  it('shows the denied state only on an explicit Create denial', async () => {
    mocks.getResourcePermission.mockResolvedValue({
      permissions: [{ operation: 'Create', access: 'deny' }],
    });
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="add-query-no-permission"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-query-no-permission"]').text()).toContain(
      'You do not have permission to create queries.',
    );
    await wrapper.find('[data-testid="add-query-sql"]').setValue('select 1');
    await flushPromises();
    expect((wrapper.find('[data-testid="add-query-save"]').element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('shows no denied state when the permission read fails; Save stays disabled', async () => {
    // Pin AddQueryPage never renders a denied placeholder of its own:
    // an unknown permission (failed read) leaves the form visible with
    // Save disabled, not a false denial.
    mocks.getResourcePermission.mockRejectedValue(new Error('permission read failed'));
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="add-query-no-permission"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-query-form"]').exists()).toBe(true);
    await wrapper.find('[data-testid="add-query-sql"]').setValue('select 1');
    await flushPromises();
    expect((wrapper.find('[data-testid="add-query-save"]').element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });
});
