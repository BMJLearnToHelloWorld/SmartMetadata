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
import IncidentsListView from './IncidentsListView.vue';

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
      { path: '/observability/incidents', name: 'observability-incidents', component: IncidentsListView },
      { path: '/observability/incidents/:id', name: 'observability-incident', component: { template: '<div>i</div>' } },
    ],
  });
  await router.push('/observability/incidents');
  await router.isReady();
  const wrapper = mount(IncidentsListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('IncidentsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testCases/testCaseIncidentStatus')) {
          return jsonResponse({
            data: [
              {
                id: 'inc1',
                testCaseResolutionStatusType: 'New',
                testCaseReference: { name: 'row_count', fullyQualifiedName: 'svc.db.schema.orders.row_count' },
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

  it('renders status and test-case filters and passes them to the incident API', async () => {
    const fetchSpy = fetch as unknown as ReturnType<typeof vi.fn>;
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="incidents-status-filter"]').exists()).toBe(true);
    const filterHost = wrapper.find('[data-testid="incidents-test-case-filter"]');
    expect(filterHost.exists()).toBe(true);
    // The testid lands either on the input itself or on its wrapper.
    const filter = filterHost.element.tagName === 'INPUT' ? filterHost : filterHost.find('input');
    expect(filter.exists()).toBe(true);
    await filter.setValue('svc.db.schema.orders.row_count');
    await filter.trigger('change');
    await flushPromises();
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('testCaseFQN='))).toBe(true);
  });

  it('renders latest incidents from the incident status API', async () => {
    const { wrapper, router } = await mountView();
    expect(wrapper.text()).toContain('svc.db.schema.orders.row_count');
    expect(wrapper.text()).toContain('New');
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="incidents-table"]').exists()).toBe(true);
    await wrapper.find('[data-testid="incident-row-inc1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('observability-incident');
  });
});
