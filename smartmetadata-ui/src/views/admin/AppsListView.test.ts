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
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AppsListView from './AppsListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountApps() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/apps', name: 'admin-apps', component: AppsListView },
      { path: '/admin/apps/:id', name: 'admin-app', component: { template: '<div>app</div>' } },
    ],
  });
  await router.push('/admin/apps');
  await router.isReady();
  const wrapper = mount(AppsListView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('AppsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/apps')) {
          return jsonResponse({
            data: [
              {
                id: 'a1',
                name: 'DataInsightsReportApp',
                displayName: 'Data Insights',
                appType: 'internal',
                scheduleType: 'Scheduled',
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

  it('renders installed apps from GET /v1/apps without marketplace install UI', async () => {
    const { wrapper } = await mountApps();
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Insights');
    expect(wrapper.find('[data-testid="admin-apps-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="install-app"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="marketplace-apps"]').exists()).toBe(false);
  });

  it('shows Empty when GET /v1/apps returns no data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })));
    const { wrapper } = await mountApps();
    expect(wrapper.find('[data-testid="entity-list-empty"]').exists()).toBe(true);
  });

  it('opens app detail on name click', async () => {
    const { wrapper, router } = await mountApps();
    await wrapper.get('[data-testid="app-row-a1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-app');
    expect(router.currentRoute.value.params.id).toBe('a1');
  });
});
