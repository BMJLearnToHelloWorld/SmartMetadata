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

async function mountView(initialPath = '/ingestion/services') {
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
      {
        path: '/ingestion/services/add',
        name: 'ingestion-service-add',
        component: { template: '<div>wizard</div>' },
      },
    ],
  });
  await router.push(initialPath);
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
        if (url.includes('/api/v1/services/dashboardServices')) {
      return new Response(
        JSON.stringify({
          data: [{ id: 'd1', name: 'bi', serviceType: 'Superset' }],
          paging: { total: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/api/v1/services/messagingServices')) {
          return jsonResponse({
            data: [{ id: 'm1', name: 'events', serviceType: 'Kafka' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/services/storageServices')) {
          return jsonResponse({
            data: [{ id: 'st1', name: 'lake', serviceType: 'S3' }],
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

  it('renders database, messaging, dashboard, and storage services from the list APIs', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Warehouse');
    expect(wrapper.text()).toContain('events');
    expect(wrapper.text()).toContain('bi');
    expect(wrapper.text()).toContain('Superset');
    expect(wrapper.text()).toContain('lake');
    expect(wrapper.text()).toContain('S3');
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="services-table"]').exists()).toBe(true);
    // Stage 8 convergence: the wizard is the single create entry; the Modal is gone.
    expect(wrapper.find('[data-testid="create-service-wizard"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-service"]').exists()).toBe(false);
  });

  it('navigates to the wizard as the single create entry', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="create-service-wizard"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service-add');
  });

  it('opens service detail on name click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="service-row-s1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toMatchObject({ kind: 'database', id: 's1' });
  });

  it('offers no row delete action (D-F7: the pin has no list-level service delete)', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="row-overflow-s1"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="row-overflow-delete"]')).toBeNull();
    const deleted = vi.mocked(fetch).mock.calls.some(([, init]) => {
      const method = typeof init === 'object' && init && 'method' in init ? String(init.method) : 'GET';
      return method === 'DELETE';
    });
    expect(deleted).toBe(false);
  });

  it('requests non-deleted services by default and deleted ones when the switch is on', async () => {
    const { wrapper } = await mountView();
    const urls = () => vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(
      urls().some(
        (url) =>
          url.includes('/api/v1/services/databaseServices') && url.includes('include=non-deleted'),
      ),
    ).toBe(true);
    await wrapper.find('[data-testid="services-show-deleted"]').trigger('click');
    await flushPromises();
    expect(
      urls().some(
        (url) => url.includes('/api/v1/services/databaseServices') && url.includes('include=deleted'),
      ),
    ).toBe(true);
  });

  it('keeps sibling services when storage list 404s (Promise.allSettled)', async () => {
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
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/services/dashboardServices')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/services/storageServices')) {
          return new Response('not found', { status: 404 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Warehouse');
  });

  it('filters by health from the overview endpoint when ?health=failing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/overview')) {
          return jsonResponse({
            data: [
              {
                id: 's9',
                name: 'broken',
                displayName: 'Broken',
                entityType: 'databaseService',
                serviceType: 'Postgres',
                health: 'failed',
              },
            ],
            total: 1,
            healthCounts: { databaseService: { failed: 1, success: 2, notRun: 0 } },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView('/ingestion/services?health=failing');
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain('Broken');
    // The failing chip is active and carries the estate-wide count.
    expect(wrapper.get('[data-testid="services-health-failing"]').text()).toContain('1');
    expect(wrapper.get('[data-testid="services-health-healthy"]').text()).toContain('2');
    // The per-kind list APIs were never called for the filtered view.
    const listCalled = vi.mocked(fetch).mock.calls.some(([input]) =>
      String(input).includes('/api/v1/services/databaseServices'),
    );
    expect(listCalled).toBe(false);
  });

});
