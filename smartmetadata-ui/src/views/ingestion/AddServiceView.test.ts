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
import AddServiceView from './AddServiceView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AddServiceView', () => {
  const calls: Array<{ url: string; method?: string }> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method });
        if (url.includes('/api/v1/services/databaseServices') && init?.method === 'POST') {
          return jsonResponse({ id: 's9', name: 'warehouse', serviceType: 'Postgres' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('walks type, connection, and review steps and creates the service', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="wizard-step-type"]').exists()).toBe(true);
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-connection"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-test-connection-residual"]').exists()).toBe(true);

    const nameInput = wrapper.find('[data-testid="wizard-service-name"]');
    await nameInput.setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-review"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-connection-json"]').text()).toContain('Postgres');
    expect(wrapper.find('[data-testid="wizard-connection-json"]').text()).toContain('localhost:5432');

    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.url.includes('/api/v1/services/databaseServices') && call.method === 'POST')).toBe(true);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toMatchObject({ kind: 'database', id: 's9' });
  });
});
