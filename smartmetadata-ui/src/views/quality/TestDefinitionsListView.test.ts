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
import TestDefinitionsListView from './TestDefinitionsListView.vue';

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
      { path: '/quality/test-definitions', name: 'quality-test-definitions', component: TestDefinitionsListView },
      { path: '/quality/test-definitions/:id', name: 'quality-test-definition', component: { template: '<div>td</div>' } },
    ],
  });
  await router.push('/quality/test-definitions');
  await router.isReady();
  const wrapper = mount(TestDefinitionsListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('TestDefinitionsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testDefinitions')) {
          return jsonResponse({
            data: [
              {
                id: 'td1',
                name: 'tableRowCountToBeBetween',
                displayName: 'Row count between',
                entityType: 'TABLE',
                testPlatforms: ['OpenMetadata'],
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

  it('renders test definitions from GET /v1/dataQuality/testDefinitions', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Row count between');
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-definitions-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-test-definition"]').exists()).toBe(true);
  });

  it('opens definition detail on name click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="test-definition-row-td1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-definition');
    expect(router.currentRoute.value.params.id).toBe('td1');
  });
});
