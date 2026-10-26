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
import TestSuitesListView from './TestSuitesListView.vue';

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
      { path: '/quality/test-suites', name: 'quality-test-suites', component: TestSuitesListView },
      { path: '/quality/test-suites/:id', name: 'quality-test-suite', component: { template: '<div>ts</div>' } },
    ],
  });
  await router.push('/quality/test-suites');
  await router.isReady();
  const wrapper = mount(TestSuitesListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('TestSuitesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testSuites')) {
          return jsonResponse({
            data: [
              {
                id: 'ts1',
                name: 'orders_suite',
                basic: true,
                tests: [{ name: 'row_count' }],
                owners: [{ name: 'alice' }],
                summary: { success: 1, failed: 1, total: 2 },
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

  it('renders table suites and success percent from GET /v1/dataQuality/testSuites', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.get('[data-testid="test-suites-table"]').text()).toContain('orders_suite');
    expect(wrapper.text()).toContain('50%');
    expect(wrapper.get('[data-testid="test-suites-subtabs"]').text()).toContain('Table Suites');
  });

  it('opens suite detail on name click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="test-suite-row-ts1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-suite');
  });
});
