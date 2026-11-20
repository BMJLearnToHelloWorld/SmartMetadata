/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
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

describe('DataProductsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
});
