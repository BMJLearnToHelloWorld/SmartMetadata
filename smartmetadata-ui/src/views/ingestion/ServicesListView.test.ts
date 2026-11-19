/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import ServicesListView from './ServicesListView.vue';

/**
 * The `settings.services.*` keys the view references are written by the
 * integration line; until then the test merges the pin-verbatim values
 * so Mode A assertions read real copy instead of key strings.
 */
const SECTION_MESSAGES = {
  settings: {
    services: {
      service: 'Service',
      addEntity: 'Add {entity}',
      addNewEntity: 'Add New {entity}',
      viewEntity: 'View {entity}',
      searchEntity: 'Search {entity}',
      view: { table: 'Table', card: 'Card' },
      header: { database: 'Databases', dashboard: 'Dashboards' },
      subheader: {
        database: 'Database services',
        dashboard: 'Dashboard services',
      },
      empty: {
        database: { title: 'No database services', description: 'Connect one.' },
        dashboard: { title: 'No dashboard services', description: 'Connect one.' },
      },
      noDataFound: 'No data found',
      card: { brokerPlural: 'Brokers', urlUppercase: 'URL', tracking: 'Tracking' },
    },
  },
  message: {
    'no-permission-for-action': 'You do not have permission to perform this action.',
    'no-access-placeholder':
      "You don't have necessary permissions. Please check with the admin to get the <0>{entity}</0> permission.",
  },
};

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
  const i18n = createTestI18n();
  i18n.global.mergeLocaleMessage('en-US', SECTION_MESSAGES);
  const wrapper = mount(ServicesListView, {
    global: { plugins: [pinia, router, Antd, i18n] },
  });
  await flushPromises();
  return { wrapper, router };
}

async function clickKindTab(wrapper: VueWrapper, pattern: RegExp): Promise<void> {
  const tabs = wrapper.findAll('.ant-tabs-tab');
  const tab = tabs.find((item) => pattern.test(item.text()));
  expect(tab).toBeDefined();
  await tab!.trigger('click');
  await flushPromises();
}

function fetchUrls(): string[] {
  return vi.mocked(fetch).mock.calls.map(([input]) => String(input));
}

/**
 * The search box: antd forwards `data-testid` onto the inner input
 * element, so the host found by testid may itself be the input.
 */
function searchInputOf(wrapper: VueWrapper) {
  const host = wrapper.find('[data-testid="services-search"]');
  expect(host.exists()).toBe(true);
  return host.element.tagName === 'INPUT' ? host : host.find('input');
}

function permissionResponse(operations: Array<{ operation: string; access: string }>): unknown {
  return { resource: 'databaseService', permissions: operations };
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
    message.destroy();
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
    // The list bypasses the shell (design §3.9) and renders the
    // table directly; there is no shell wrapper anymore.
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(false);
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

  it('has no row-action column at all (D-2) and issues no delete', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid^="row-overflow-"]').exists()).toBe(false);
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

  it('denies the single-category view without view permission and fetches no list data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/databaseService')) {
          return jsonResponse(permissionResponse([]));
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper, router } = await mountView();
    const callsBefore = fetchUrls().length;
    await clickKindTab(wrapper, /database/i);
    expect(wrapper.text()).toContain('View Database Service');
    expect(wrapper.find('[data-testid="services-table"]').exists()).toBe(false);
    // No list fetch happened after the tab switch, and the URL kept
    // its path (the gate never navigates away).
    expect(fetchUrls().slice(callsBefore).some((url) => url.includes('databaseServices'))).toBe(false);
    expect(router.currentRoute.value.path).toBe('/ingestion/services');
  });

  it('renders the official single-category list with owners-only fields when permitted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/databaseService')) {
          return jsonResponse(
            permissionResponse([
              { operation: 'ViewAll', access: 'allow' },
              { operation: 'Create', access: 'allow' },
            ]),
          );
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({
            data: [
              {
                id: 's1',
                name: 'warehouse',
                displayName: 'Warehouse',
                fullyQualifiedName: 'warehouse',
                serviceType: 'Postgres',
                owners: [{ id: 'u1', name: 'alice', type: 'user' }],
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    const callsBefore = fetchUrls().length;
    await clickKindTab(wrapper, /database/i);
    expect(wrapper.find('[data-testid="page-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="page-header"]').text()).toContain('Databases');
    expect(wrapper.find('[data-testid="add-service-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-service-button"]').text()).toContain('Add New Service');
    expect(wrapper.find('[data-testid="service-name-warehouse"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('alice');
    const listUrl = fetchUrls()
      .slice(callsBefore)
      .find(
        (url) =>
          url.includes('/api/v1/services/databaseServices') &&
          /[?&]fields=owners(&|$)/.test(url),
      );
    expect(listUrl).toBeDefined();
    expect(listUrl).toContain('limit=15');
    expect(listUrl).toContain('include=non-deleted');
    // The official list has no Kind/FQN columns and no row actions.
    expect(wrapper.find('[data-testid^="row-overflow-"]').exists()).toBe(false);
  });

  it('shows the first-run empty state with a footer add button when the category is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/databaseService')) {
          return jsonResponse(
            permissionResponse([
              { operation: 'ViewAll', access: 'allow' },
              { operation: 'Create', access: 'allow' },
            ]),
          );
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await clickKindTab(wrapper, /database/i);
    expect(wrapper.find('[data-testid="services-empty-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="services-empty-placeholder"]').text()).toContain(
      'No database services',
    );
    expect(wrapper.find('[data-testid="add-placeholder-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(false);
  });

  it('searches through the service index after the debounce, and clears immediately', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/databaseService')) {
          return jsonResponse(
            permissionResponse([
              { operation: 'ViewAll', access: 'allow' },
              { operation: 'Create', access: 'allow' },
            ]),
          );
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({
            data: [
              {
                id: 's1',
                name: 'warehouse',
                displayName: 'Warehouse',
                fullyQualifiedName: 'warehouse',
                serviceType: 'Postgres',
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({
            hits: {
              total: { value: 0 },
              hits: [],
            },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await clickKindTab(wrapper, /database/i);
    const input = searchInputOf(wrapper);
    await input.setValue('ware');
    await flushPromises();
    // Still inside the debounce window: no search request yet.
    expect(fetchUrls().some((url) => url.includes('/api/v1/search/query'))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await flushPromises();
    const searchUrl = fetchUrls().find((url) => url.includes('/api/v1/search/query'));
    expect(searchUrl).toBeDefined();
    expect(searchUrl).toContain('index=databaseService');
    expect(searchUrl).toContain('query_filter=');
    expect(decodeURIComponent(searchUrl ?? '')).toContain('name.keyword');
    expect(decodeURIComponent(searchUrl ?? '')).toContain('*ware*');
    // A narrowing search with no hits renders the plain placeholder.
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="services-empty-placeholder"]').exists()).toBe(false);
    // Clearing applies immediately, without waiting out the debounce.
    const restCallsBefore = fetchUrls().filter((url) =>
      url.includes('/api/v1/services/databaseServices'),
    ).length;
    await input.setValue('');
    await flushPromises();
    expect(
      fetchUrls().filter((url) => url.includes('/api/v1/services/databaseServices')).length,
    ).toBeGreaterThan(restCallsBefore);
  });

  it('renders cards with the type row and optional fields in card view', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/databaseService')) {
          return jsonResponse(
            permissionResponse([
              { operation: 'ViewAll', access: 'allow' },
              { operation: 'Create', access: 'allow' },
            ]),
          );
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({
            data: [
              {
                id: 's1',
                name: 'warehouse',
                displayName: 'Warehouse',
                fullyQualifiedName: 'warehouse',
                description: 'Main warehouse',
                serviceType: 'Postgres',
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await clickKindTab(wrapper, /database/i);
    await wrapper.find('[data-testid="services-view-card"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="service-name-warehouse"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Main warehouse');
    expect(wrapper.text()).toContain('Postgres');
  });

  it('switching category clears the search and fetches the new category', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/')) {
          return jsonResponse(
            permissionResponse([
              { operation: 'ViewAll', access: 'allow' },
              { operation: 'Create', access: 'allow' },
            ]),
          );
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({
            data: [
              {
                id: 's1',
                name: 'warehouse',
                displayName: 'Warehouse',
                fullyQualifiedName: 'warehouse',
                serviceType: 'Postgres',
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/services/dashboardServices')) {
          return jsonResponse({
            data: [
              {
                id: 'd1',
                name: 'bi',
                displayName: 'BI',
                fullyQualifiedName: 'bi',
                serviceType: 'Superset',
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await clickKindTab(wrapper, /database/i);
    const input = searchInputOf(wrapper);
    await input.setValue('ware');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe('ware');
    await clickKindTab(wrapper, /dashboard/i);
    expect(
      (searchInputOf(wrapper).element as HTMLInputElement).value,
    ).toBe('');
    expect(wrapper.text()).toContain('BI');
    expect(
      fetchUrls().some((url) => url.includes('/api/v1/services/dashboardServices')),
    ).toBe(true);
  });

  it('empties the list and toasts when the single-category fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/databaseService')) {
          return jsonResponse(
            permissionResponse([
              { operation: 'ViewAll', access: 'allow' },
              { operation: 'Create', access: 'allow' },
            ]),
          );
        }
        return new Response('boom', { status: 500 });
      }),
    );
    const { wrapper } = await mountView();
    await clickKindTab(wrapper, /database/i);
    expect(wrapper.find('[data-testid="services-empty-placeholder"]').exists()).toBe(true);
    // The toast renders through antd's message app; give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('.ant-message-error')).not.toBeNull();
  });
});

