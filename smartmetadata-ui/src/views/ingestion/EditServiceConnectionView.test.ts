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
import EditServiceConnectionView from './EditServiceConnectionView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('EditServiceConnectionView', () => {
  const calls: Array<{ url: string; method?: string }> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method });
        if (url.includes('/api/v1/services/databaseServices/s1')) {
          return jsonResponse({
            id: 's1',
            name: 'warehouse',
            serviceType: 'Postgres',
            connection: { config: { type: 'Postgres', hostPort: 'localhost:5432' } },
          });
        }
        if (url.includes('/api/v1/services/databaseServices') && init?.method === 'PUT') {
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'Postgres' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the stored connection and saves through the kind update API', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/ingestion/services/:kind/:id/connection',
          name: 'ingestion-service-connection',
          component: EditServiceConnectionView,
          props: true,
        },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/database/s1/connection');
    await router.isReady();
    const wrapper = mount(EditServiceConnectionView, {
      props: { kind: 'database', id: 's1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="edit-connection-form"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-connection-filters-residual"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-connection-save"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.url.includes('/api/v1/services/databaseServices') && call.method === 'PUT')).toBe(true);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
  });
});
