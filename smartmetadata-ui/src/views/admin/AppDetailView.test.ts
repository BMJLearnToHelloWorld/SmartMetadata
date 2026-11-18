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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AppDetailView from './AppDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountApp() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/apps', name: 'admin-apps', component: { template: '<div>apps</div>' } },
      { path: '/settings/apps/:id', name: 'admin-app', component: AppDetailView, props: true },
    ],
  });
  await router.push('/settings/apps/a1');
  await router.isReady();
  const wrapper = mount(AppDetailView, {
    props: { id: 'a1' },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('AppDetailView breadcrumb exception (row 2)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/apps/a1')) {
          return jsonResponse({
            id: 'a1',
            name: 'DataInsightsReportApp',
            displayName: 'Data Insights',
            appType: 'internal',
            fullyQualifiedName: 'DataInsightsReportApp',
          });
        }
        return jsonResponse({}, 404);
      }),
    );
  });

  it('renders no breadcrumb and keeps the Browse Apps return button', async () => {
    const { wrapper } = await mountApp();
    expect(wrapper.find('[data-testid="entity-detail-breadcrumb"]').exists()).toBe(false);
    const button = wrapper.find('[data-testid="admin-app-browse-apps"]');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain('Browse Apps');
    expect(wrapper.find('[data-testid="admin-app-overview"]').exists()).toBe(true);
  });

  it('navigates the Browse Apps button back to the apps list', async () => {
    const { wrapper, router } = await mountApp();
    await wrapper.find('[data-testid="admin-app-browse-apps"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-apps');
  });
});
