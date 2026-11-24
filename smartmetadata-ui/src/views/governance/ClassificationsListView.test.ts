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
import ClassificationsListView from './ClassificationsListView.vue';

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
      {
        path: '/governance/classifications',
        name: 'governance-classifications',
        component: ClassificationsListView,
      },
      {
        path: '/governance/classifications/:id',
        name: 'governance-classification',
        component: { template: '<div>c</div>' },
      },
    ],
  });
  await router.push('/governance/classifications');
  await router.isReady();
  const wrapper = mount(ClassificationsListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('ClassificationsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/classification')) {
          return jsonResponse({
            resource: 'classification',
            permissions: [
              { operation: 'Create', access: 'allow' },
              { operation: 'Delete', access: 'allow' },
            ],
          });
        }
        if (url.includes('/api/v1/classifications')) {
          return jsonResponse({
            data: [{ id: 'c1', name: 'PII', displayName: 'Personal data', description: 'PII tags', termCount: 3 }],
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

  it('renders classifications from GET /v1/classifications', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Personal data');
    expect(wrapper.find('[data-testid="classifications-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-classification"]').exists()).toBe(true);
  });

  it('opens classification detail on name click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="classification-row-c1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-classification');
    expect(router.currentRoute.value.params.id).toBe('c1');
  });

  it('shows the row delete entry with a Delete grant', async () => {
    const { wrapper } = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="row-overflow-c1"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="row-overflow-delete"]')?.textContent).toContain('Delete');
    // The overflow menu teleports into document.body: unmount so its
    // overlay cannot leak into the next test's null assertion.
    wrapper.unmount();
  });

  describe('without a classification grant', () => {
    it('hides create and row delete', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('/v1/permissions/classification')) {
            return jsonResponse({ resource: 'classification', permissions: [] });
          }
          if (url.includes('/api/v1/classifications')) {
            return jsonResponse({
              data: [{ id: 'c1', name: 'PII', displayName: 'Personal data', description: 'PII tags', termCount: 3 }],
              paging: { total: 1 },
            });
          }
          return new Response('not found', { status: 404 });
        }),
      );
      const { wrapper } = await mountView();
      await flushPromises();
      expect(wrapper.find('[data-testid="create-classification"]').exists()).toBe(false);
      await wrapper.find('[data-testid="row-overflow-c1"]').trigger('click');
      await flushPromises();
      expect(document.querySelector('[data-testid="row-overflow-delete"]')).toBeNull();
    });
  });
});
