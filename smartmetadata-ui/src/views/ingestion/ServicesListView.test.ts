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
import ServicesListView from './ServicesListView.vue';

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
      { path: '/ingestion/services', name: 'ingestion-services', component: ServicesListView },
      {
        path: '/ingestion/services/:kind/:id',
        name: 'ingestion-service',
        component: { template: '<div>svc</div>' },
      },
    ],
  });
  await router.push('/ingestion/services');
  await router.isReady();
  const wrapper = mount(ServicesListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('ServicesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({
            data: [{ id: 's1', name: 'warehouse', displayName: 'Warehouse', serviceType: 'Postgres' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/services/messagingServices')) {
          return jsonResponse({
            data: [{ id: 'm1', name: 'events', serviceType: 'Kafka' }],
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

  it('renders database and messaging services from the two list APIs', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Warehouse');
    expect(wrapper.text()).toContain('events');
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="services-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-service"]').exists()).toBe(true);
  });

  it('opens service detail on name click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="service-row-s1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toMatchObject({ kind: 'database', id: 's1' });
  });

  it('deletes a service from the overflow menu after confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="row-overflow-s1"]').trigger('click');
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="row-overflow-delete"]')?.click();
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalled();
    const deleted = vi.mocked(fetch).mock.calls.some(([input, init]) => {
      const url = String(input);
      const method = typeof init === 'object' && init && 'method' in init ? String(init.method) : 'GET';
      return url.includes('/api/v1/services/databaseServices/s1') && method === 'DELETE';
    });
    expect(deleted).toBe(true);
    confirmSpy.mockRestore();
  });
});
