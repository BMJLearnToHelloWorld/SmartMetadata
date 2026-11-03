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
import MarketplaceOverviewView from './MarketplaceOverviewView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function searchPayload(hits: Record<string, unknown>[]): Record<string, unknown> {
  return {
    hits: {
      total: { value: hits.length },
      hits: hits.map((source) => ({ _index: 'x_search_index', _source: source })),
    },
  };
}

const PRODUCT_HIT = {
  id: 'dp1',
  name: 'sales-metrics',
  displayName: 'Sales Metrics',
  fullyQualifiedName: 'sales-metrics',
  description: 'Key sales performance indicators',
  entityType: 'dataProduct',
};

const DOMAIN_HIT = {
  id: 'd1',
  name: 'sales',
  displayName: 'Sales',
  fullyQualifiedName: 'sales',
  description: 'Sales domain',
  entityType: 'domain',
};

function stubFetch(onPost?: (url: string, init?: RequestInit) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        return onPost ? onPost(url, init) : jsonResponse({});
      }
      if (url.includes('/v1/search/query')) {
        const index = new URL(url).searchParams.get('index');
        return jsonResponse(searchPayload(index === 'domain' ? [DOMAIN_HIT] : [PRODUCT_HIT]));
      }
      if (url.includes('/v1/announcements')) {
        return jsonResponse({
          data: [
            {
              id: 'a1',
              name: 'launch',
              displayName: 'Launch',
              description: 'New domain launched',
              entityLink: '<#E::domain::sales>',
            },
            { id: 'a2', name: 'other', description: 'Unrelated', entityLink: '<#E::table::t>' },
          ],
          paging: { total: 2 },
        });
      }
      if (url.includes('/v1/domains')) {
        return jsonResponse({
          data: [{ id: 'd1', name: 'sales', fullyQualifiedName: 'sales' }],
          paging: { total: 1 },
        });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/marketplace', name: 'marketplace-overview', component: MarketplaceOverviewView },
      { path: '/governance/domains', name: 'governance-domains', component: { template: '<div />' } },
      { path: '/governance/data-products', name: 'governance-data-products', component: { template: '<div />' } },
      { path: '/governance/domains/:id', name: 'governance-domain', component: { template: '<div />' } },
      { path: '/governance/data-products/:id', name: 'governance-data-product', component: { template: '<div />' } },
    ],
  });
  return { pinia, router };
}

describe('MarketplaceOverviewView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the greeting hero, announcements, and both widgets', { timeout: 15000 }, async () => {
    stubFetch();
    const { pinia, router } = mountPage();
    await router.push('/marketplace');
    await router.isReady();
    const wrapper = mount(MarketplaceOverviewView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="marketplace-overview"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="marketplace-data-products"]').text()).toContain('Sales Metrics');
    expect(wrapper.find('[data-testid="marketplace-data-products"]').text()).toContain('(1)');
    expect(wrapper.find('[data-testid="marketplace-domains"]').text()).toContain('Sales');
    expect(wrapper.find('[data-testid="marketplace-announcements"]').text()).toContain('Launch');
    expect(wrapper.find('[data-testid="marketplace-announcements"]').text()).not.toContain('Unrelated');
  });

  it('searches both indexes and shows result links', { timeout: 15000 }, async () => {
    stubFetch();
    const { pinia, router } = mountPage();
    await router.push('/marketplace');
    await router.isReady();
    const wrapper = mount(MarketplaceOverviewView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const search = wrapper.get('[data-testid="marketplace-search"]');
    const native = search.find('input');
    if (native.exists()) {
      await native.setValue('sales');
    } else {
      await search.setValue('sales');
    }
    await wrapper.find('.ant-input-search-button').trigger('click');
    await flushPromises();
    const results = wrapper.find('[data-testid="marketplace-search-results"]');
    expect(results.exists()).toBe(true);
    expect(results.text()).toContain('Sales Metrics');
    expect(results.text()).toContain('Sales');
  });

  it('creates a data product with name + description', { timeout: 15000 }, async () => {
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    stubFetch((url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      posts.push({ url, body });
      return jsonResponse({ id: 'dp9', name: body.name });
    });
    const { pinia, router } = mountPage();
    await router.push('/marketplace');
    await router.isReady();
    const wrapper = mount(MarketplaceOverviewView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="marketplace-add-data-product"]').trigger('click');
    await wrapper.find('[data-testid="marketplace-data-product-name"]').setValue('churn-metrics');
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    // Description is required: without it the form errors and posts nothing.
    expect(posts.length).toBe(0);
    expect(wrapper.find('[data-testid="marketplace-form-error"]').exists()).toBe(true);
    await wrapper.find('[data-testid="marketplace-data-product-description"]').setValue('Churn signals');
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    expect(posts.length).toBe(1);
    expect(posts[0].url).toContain('/api/v1/dataProducts');
    expect(posts[0].body).toMatchObject({ name: 'churn-metrics', description: 'Churn signals' });
  });
});
