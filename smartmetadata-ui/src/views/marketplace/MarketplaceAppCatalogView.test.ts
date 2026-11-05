/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import MarketplaceAppCatalogView from './MarketplaceAppCatalogView.vue';
import MarketplaceAppDetailView from './MarketplaceAppDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountCatalog() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 'admin', name: 'admin', isAdmin: true };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/marketplace/apps', name: 'marketplace-app-catalog', component: MarketplaceAppCatalogView },
      { path: '/marketplace/apps/:fqn', name: 'marketplace-app-detail', component: MarketplaceAppDetailView, props: true },
      { path: '/marketplace', name: 'marketplace-overview', component: { template: '<div>data market</div>' } },
    ],
  });
  await router.push('/marketplace/apps');
  await router.isReady();
  const wrapper = mount(MarketplaceAppCatalogView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('MarketplaceAppCatalogView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/apps/marketplace') && !url.includes('/name/')) {
          return jsonResponse({
            data: [
              {
                name: 'DataInsightsApplication',
                displayName: 'Data Insights',
                description: 'Insights app',
                fullyQualifiedName: 'DataInsightsApplication',
                developer: 'Collate',
                enabled: true,
              },
              {
                name: 'CacheWarmupApplication',
                displayName: 'Cache Warmup',
                description: 'Warmup app',
                fullyQualifiedName: 'CacheWarmupApplication',
                enabled: false,
              },
            ],
            paging: { total: 2 },
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

  it('renders catalog cards from GET /v1/apps/marketplace, not the installed list', async () => {
    const { wrapper } = await mountCatalog();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('/api/v1/apps/marketplace'))).toBe(true);
    expect(wrapper.find('[data-testid="marketplace-app-card-DataInsightsApplication"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Insights');
    expect(wrapper.text()).toContain('Insights app');
  });

  it('marks a disabled cache-warmup card with the cache reason', async () => {
    const { wrapper } = await mountCatalog();
    const card = wrapper.find('[data-testid="marketplace-app-card-CacheWarmupApplication"]');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain('Cache Service');
  });

  it('navigates to the app detail on card click', async () => {
    const { wrapper, router } = await mountCatalog();
    await wrapper.find('[data-testid="marketplace-app-card-DataInsightsApplication"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('marketplace-app-detail');
    expect(String(router.currentRoute.value.params.fqn)).toBe('DataInsightsApplication');
  });

  it('shows an empty state when the catalog is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    const { wrapper } = await mountCatalog();
    expect(wrapper.find('[data-testid="marketplace-app-catalog-empty"]').exists()).toBe(true);
  });
});
