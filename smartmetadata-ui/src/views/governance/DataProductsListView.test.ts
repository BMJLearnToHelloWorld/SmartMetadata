/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Modal } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { usePersonaStore } from '@/stores/persona';
import { createTestI18n } from '@/test/i18n';
import DataProductsListView from './DataProductsListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const listBody = {
  data: [
    {
      id: 'dp1',
      name: 'customer-360',
      displayName: 'Customer 360',
      description: 'Customer view',
      domains: [{ name: 'Marketing' }],
    },
    {
      id: 'dp2',
      name: 'orders-360',
      displayName: 'Orders 360',
      description: 'Orders view',
      domains: [{ name: 'Marketing' }],
    },
  ],
  paging: { total: 2 },
};

const searchBody = {
  hits: {
    total: { value: 1 },
    hits: [
      {
        _index: 'data_product_search_index',
        _id: 'dp1',
        _source: {
          id: 'dp1',
          name: 'customer-360',
          displayName: 'Customer 360',
          description: 'Customer view',
          fullyQualifiedName: 'customer-360',
          domains: [{ id: 'd1', name: 'Marketing' }],
        },
      },
    ],
  },
};

function createRouterForList() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/data-products', name: 'governance-data-products', component: DataProductsListView },
      {
        path: '/governance/data-products/:id',
        name: 'governance-data-product',
        component: { template: '<div>dp</div>' },
      },
    ],
  });
  return router;
}

async function mountList() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouterForList();
  await router.push('/governance/data-products');
  await router.isReady();
  const wrapper = mount(DataProductsListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('DataProductsListView', () => {
  // G3 bulk-delete partial failure: when true, DELETE /v1/dataProducts/dp2 fails.
  let failDeleteDp2 = false;
  // The stub list is stateful across deletes, like the server: a
  // successfully deleted product stops appearing in later list loads.
  let deletedIds = new Set<string>();

  beforeEach(() => {
    failDeleteDp2 = false;
    deletedIds = new Set<string>();
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/search/query')) {
          return jsonResponse(searchBody);
        }
        if (url.includes('/api/v1/dataProducts')) {
          if (init?.method === 'DELETE') {
            if (failDeleteDp2 && url.includes('/dp2')) {
              return new Response('delete failed', { status: 500 });
            }
            const id = url.split('/').pop()?.split('?')[0];
            if (id) {
              deletedIds.add(id);
            }
            return jsonResponse({});
          }
          return jsonResponse({
            ...listBody,
            data: listBody.data.filter((item) => !deletedIds.has(item.id)),
            paging: { total: listBody.data.filter((item) => !deletedIds.has(item.id)).length },
          });
        }
        if (url.includes('/api/v1/domains')) {
          return jsonResponse({ data: [{ id: 'd1', name: 'Marketing', domainType: 'Consumer-aligned' }] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('renders data products from GET /v1/dataProducts', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/data-products', name: 'governance-data-products', component: DataProductsListView },
        {
          path: '/governance/data-products/:id',
          name: 'governance-data-product',
          component: { template: '<div>dp</div>' },
        },
      ],
    });
    await router.push('/governance/data-products');
    await router.isReady();
    const wrapper = mount(DataProductsListView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Customer 360');
    expect(wrapper.find('[data-testid="data-products-table"]').exists()).toBe(true);
    await wrapper.find('[data-testid="data-product-row-dp1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-data-product');
  });

  describe('create permission gate (pin DataProductListPage.tsx:244,367,453)', () => {
    async function mountWithProductOps(operations: Array<{ operation: string; access: string }>) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('/v1/permissions/dataProduct')) {
            return jsonResponse({ resource: 'dataProduct', permissions: operations });
          }
          if (url.includes('/api/v1/dataProducts')) {
            return jsonResponse({
              data: [
                {
                  id: 'dp1',
                  name: 'customer-360',
                  displayName: 'Customer 360',
                  description: 'Customer view',
                  domains: [{ name: 'Marketing' }],
                },
              ],
              paging: { total: 1 },
            });
          }
          if (url.includes('/api/v1/domains')) {
            return jsonResponse({ data: [{ id: 'd1', name: 'Marketing', domainType: 'Consumer-aligned' }] });
          }
          return new Response('not found', { status: 404 });
        }),
      );
      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/governance/data-products', name: 'governance-data-products', component: DataProductsListView },
          {
            path: '/governance/data-products/:id',
            name: 'governance-data-product',
            component: { template: '<div>dp</div>' },
          },
        ],
      });
      await router.push('/governance/data-products');
      await router.isReady();
      const wrapper = mount(DataProductsListView, {
        global: { plugins: [pinia, router, Antd, createTestI18n()] },
      });
      await flushPromises();
      await flushPromises();
      return wrapper;
    }

    it('shows the create button with a dataProduct Create grant', async () => {
      const wrapper = await mountWithProductOps([{ operation: 'Create', access: 'allow' }]);
      expect(wrapper.find('[data-testid="create-data-product"]').exists()).toBe(true);
    });

    it('hides the create button without a dataProduct Create grant', async () => {
      const wrapper = await mountWithProductOps([]);
      expect(wrapper.find('[data-testid="create-data-product"]').exists()).toBe(false);
    });
  });

  describe('view toggle (B-10)', () => {
    async function mountView() {
      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/governance/data-products', name: 'governance-data-products', component: DataProductsListView },
          {
            path: '/governance/data-products/:id',
            name: 'governance-data-product',
            component: { template: '<div>dp</div>' },
          },
        ],
      });
      await router.push('/governance/data-products');
      await router.isReady();
      const wrapper = mount(DataProductsListView, {
        // attachTo: jsdom label activation (the Segmented's radio
        // input) only fires for nodes connected to the document.
        attachTo: document.body,
        global: { plugins: [pinia, router, Antd, createTestI18n()] },
      });
      await flushPromises();
      return { wrapper, router, store: usePersonaStore() };
    }

    it('defaults to the table view and switches to cards from the toggle', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.find('[data-testid="data-products-table"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="data-products-cards"]').exists()).toBe(false);
      await wrapper.findAll('.ant-segmented-item')[1].trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="data-products-cards"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="data-products-table"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="data-products-cards-dp1"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('opens the data product detail from a card click', async () => {
      const { wrapper, router } = await mountView();
      await wrapper.findAll('.ant-segmented-item')[1].trigger('click');
      await flushPromises();
      await wrapper.find('[data-testid="data-products-cards-open-dp1"]').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('governance-data-product');
      expect(router.currentRoute.value.params).toMatchObject({ id: 'dp1' });
      wrapper.unmount();
    });

    it('starts in card view when the persona document stores it', async () => {
      const { wrapper, store } = await mountView();
      store.selectedPersonaId = 'p1';
      store.document = {
        name: 'p1',
        fullyQualifiedName: 'persona.p1',
        entityType: 'Page',
        data: {
          pages: [],
          personaPreferences: [{ personaId: 'p1', defaultViewModes: { dataProducts: 'card' } }],
        },
      } as never;
      await flushPromises();
      expect(wrapper.find('[data-testid="data-products-cards"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="data-products-table"]').exists()).toBe(false);
      wrapper.unmount();
    });
  });

  describe('search (G3)', () => {
    it('debounces the search box by 300ms and queries the dataProduct index', async () => {
      vi.useFakeTimers();
      const { wrapper } = await mountList();
      expect(wrapper.text()).toContain('Orders 360');
      const search = wrapper.find('[data-testid="entity-list-search"]');
      await search.setValue('customer');
      // Still debouncing: no search request yet.
      expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/v1/search/query'))).toBe(
        false,
      );
      await vi.advanceTimersByTimeAsync(300);
      await flushPromises();
      const searchCalls = vi.mocked(fetch).mock.calls.filter((call) =>
        String(call[0]).includes('/v1/search/query'),
      );
      expect(searchCalls).toHaveLength(1);
      expect(String(searchCalls[0]?.[0])).toContain('index=dataProduct');
      expect(String(searchCalls[0]?.[0])).toContain('q=customer');
      expect(wrapper.text()).toContain('Customer 360');
      expect(wrapper.text()).not.toContain('Orders 360');
      // Clearing the search restores the REST list from the first page.
      await search.setValue('');
      await vi.advanceTimersByTimeAsync(300);
      await flushPromises();
      expect(wrapper.text()).toContain('Orders 360');
      vi.useRealTimers();
    });

    it('applies the search immediately on Enter', async () => {
      vi.useFakeTimers();
      const { wrapper } = await mountList();
      const search = wrapper.find('[data-testid="entity-list-search"]');
      await search.setValue('customer');
      await search.trigger('keydown.enter');
      await flushPromises();
      expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/v1/search/query'))).toBe(
        true,
      );
      expect(wrapper.text()).not.toContain('Orders 360');
      vi.useRealTimers();
    });
  });

  describe('bulk delete (G3)', () => {
    async function selectAllRows(wrapper: Awaited<ReturnType<typeof mountList>>['wrapper']) {
      const checkbox = wrapper.find('.ant-table-thead .ant-checkbox-input');
      (checkbox.element as HTMLInputElement).checked = true;
      await checkbox.trigger('change');
      await flushPromises();
    }

    function confirmModal() {
      vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
        void Promise.resolve(config.onOk?.());
        return { destroy: vi.fn(), update: vi.fn() } as never;
      });
    }

    function deleteCalls() {
      return vi
        .mocked(fetch)
        .mock.calls.filter(
          (call) => String(call[0]).includes('/api/v1/dataProducts/') && (call[1] as RequestInit | undefined)?.method === 'DELETE',
        );
    }

    it('bulk deletes the selected products, clears the selection, and reloads', async () => {
      const { wrapper } = await mountList();
      expect(wrapper.find('[data-testid="data-products-bulk-bar"]').exists()).toBe(false);
      await selectAllRows(wrapper);
      expect(wrapper.find('[data-testid="data-products-bulk-bar"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('2 selected');
      confirmModal();
      await wrapper.get('[data-testid="data-products-bulk-delete"]').trigger('click');
      await flushPromises();
      const deletes = deleteCalls();
      expect(deletes.map((call) => String(call[0]))).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/api/v1/dataProducts/dp1'),
          expect.stringContaining('/api/v1/dataProducts/dp2'),
        ]),
      );
      expect(deletes).toHaveLength(2);
      expect(wrapper.find('[data-testid="data-products-bulk-bar"]').exists()).toBe(false);
    });

    it('keeps the failed rows selected when a bulk delete partially fails', async () => {
      failDeleteDp2 = true;
      const { wrapper } = await mountList();
      await selectAllRows(wrapper);
      confirmModal();
      await wrapper.get('[data-testid="data-products-bulk-delete"]').trigger('click');
      await flushPromises();
      expect(deleteCalls()).toHaveLength(2);
      // The failed row stays selected so it can be retried; the deleted
      // one is gone from the reloaded list.
      expect(wrapper.find('[data-testid="data-products-bulk-bar"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('1 selected');
      expect(wrapper.text()).toContain('Orders 360');
      expect(wrapper.text()).not.toContain('Customer 360');
    });

    it('clears the selection from the bulk bar', async () => {
      const { wrapper } = await mountList();
      await selectAllRows(wrapper);
      expect(wrapper.find('[data-testid="data-products-bulk-bar"]').exists()).toBe(true);
      await wrapper.get('[data-testid="data-products-clear-selection"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="data-products-bulk-bar"]').exists()).toBe(false);
    });
  });
});
