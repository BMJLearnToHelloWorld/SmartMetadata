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

const postQueryMock = vi.fn(async (_body: unknown) => ({ id: 'q9', query: 'select 1', service: 'warehouse' }));

vi.mock('@/api/queries', () => ({
  postQuery: (body: unknown) => postQueryMock(body),
}));

vi.mock('@/api/permissions', () => ({
  getResourcePermission: vi.fn(async () => ({
    permissions: [{ operation: 'Create', access: 'allow' }],
  })),
  toOperationPermissions: (permission: { permissions?: Array<{ operation: string; access: string }> }) => {
    const result: Record<string, boolean> = {};
    for (const entry of permission?.permissions ?? []) {
      result[entry.operation] = entry.access === 'allow';
    }
    return result;
  },
}));

vi.mock('@/api/auth', () => ({
  fetchLoggedInUser: vi.fn(async () => ({ id: 'u1', name: 'alice' })),
}));

vi.mock('@/api/search', () => ({
  searchAssets: vi.fn(async () => ({ total: 0, hits: [], facets: [] })),
}));

describe('AddQueryView', () => {
  it('posts the official CreateQuery payload: query, service, owners, queryDate (A16)', async () => {
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
  });
});
