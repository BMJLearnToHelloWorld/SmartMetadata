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
import QueryFullScreenView from './QueryFullScreenView.vue';

vi.mock('@/api/permissions', () => ({
  getEntityPermissionById: vi.fn(async () => ({
    permissions: [{ operation: 'ViewQueries', access: 'allow' }],
  })),
  toOperationPermissions: (permission: { permissions?: Array<{ operation: string; access: string }> }) => {
    const result: Record<string, boolean> = {};
    for (const entry of permission?.permissions ?? []) {
      result[entry.operation] = entry.access === 'allow';
    }
    return result;
  },
}));

vi.mock('@/api/queries', () => ({
  getQueryById: vi.fn(async () => ({
    id: 'q1',
    query: 'select * from orders',
    service: 'warehouse',
    votes: { upVotes: 2, downVotes: 0 },
    queryUsedIn: [{ id: 't2', type: 'table', name: 'customers' }],
  })),
}));

describe('QueryFullScreenView', () => {
  it('renders the query text after the ViewQueries gate passes (A16)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/explore', name: 'explore', component: { template: '<div>explore</div>' } }],
    });
    await router.push('/explore');
    await router.isReady();
    const wrapper = mount(QueryFullScreenView, {
      props: { fqn: 'warehouse.db.schema.orders', queryId: 'q1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="query-full-screen-sql"]').text()).toContain('select * from orders');
    expect(wrapper.text()).toContain('customers');
  });
});
