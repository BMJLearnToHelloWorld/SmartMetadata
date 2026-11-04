/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import DataAccessRequestsView from './DataAccessRequestsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/data-access-requests', name: 'data-access-requests', component: DataAccessRequestsView },
      { path: '/data-access-requests/new', name: 'data-access-request-new', component: { template: '<div>new</div>' } },
      { path: '/tasks/:id', name: 'task', component: { template: '<div>task</div>' } },
    ],
  });
  await router.push('/data-access-requests');
  await router.isReady();
  const wrapper = mount(DataAccessRequestsView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('DataAccessRequestsView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tasks/dataAccessRequests')) {
          return jsonResponse({
            data: [
              {
                id: 'dar1',
                name: 'dar-orders',
                type: 'DataAccessRequest',
                status: 'Open',
                about: { id: 'a1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' },
                createdBy: { id: 'u1', type: 'user', name: 'amy' },
                payload: { accessType: 'FullAccess', requestedAccess: 'Read', reason: 'audit' },
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads DARs from the dedicated endpoint with the open group by default', async () => {
    const { wrapper } = await mountView();
    const call = vi.mocked(fetch).mock.calls[0];
    expect(String(call[0])).toContain('/api/v1/tasks/dataAccessRequests');
    expect(String(call[0])).toContain('statusGroup=open');
    expect(wrapper.text()).toContain('dar-orders');
    expect(wrapper.text()).toContain('FullAccess');
    expect(wrapper.text()).toContain('svc.db.schema.orders');
  });

  it('opens the task detail when a row is clicked', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="dar-row-dar1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('task');
    expect(router.currentRoute.value.params.id).toBe('dar1');
  });

  it('opens the create page from the header button', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="create-data-access-request"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('data-access-request-new');
  });
});
