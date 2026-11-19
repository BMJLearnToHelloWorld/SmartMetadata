/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { getMarketPlaceApplicationList } from '@/api/marketplaceApps';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import MarketplaceAppCatalogView from './MarketplaceAppCatalogView.vue';

vi.mock('@/api/marketplaceApps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/marketplaceApps')>();
  return { ...actual, getMarketPlaceApplicationList: vi.fn() };
});

const mockedList = vi.mocked(getMarketPlaceApplicationList);

const MESSAGES = {
  en: {
    label: {
      'application-plural': 'Applications',
      'market-place': 'Market Place',
      'extend-open-meta-data': 'Extend OpenMetadata',
      'read-type': 'Read {type}',
      more: 'More',
    },
    message: {
      'application-to-improve-data': 'Applications to improve data',
      'cache-service-not-configured-message': 'Cache service not configured',
    },
  },
};

const DUMMY = { template: '<div />' };

async function mountCatalog(isAdmin = true) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { name: 'admin', isAdmin } as LoginUser;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/apps', name: 'admin-apps', component: DUMMY },
      { path: '/marketplace', name: 'marketplace-app-catalog', component: DUMMY },
      { path: '/marketplace/apps/:fqn', name: 'marketplace-app-detail', component: DUMMY },
    ],
  });
  await router.push('/marketplace');
  await router.isReady();
  const wrapper = mount(MarketplaceAppCatalogView, {
    global: {
      plugins: [Antd, pinia, router, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
      stubs: {
        PermissionPlaceholder: { template: '<div data-testid="permission-error-placeholder" />' },
        PageHeader: { template: '<div class="page-header-stub" />' },
        SmBreadcrumb: { template: '<div class="breadcrumb-stub" />' },
        NextPrevious: { template: '<div class="pagination-stub" />' },
        ApplicationCard: {
          props: {
            appName: String,
            description: String,
            disabled: Boolean,
            disabledReason: String,
            linkTitle: String,
            title: String,
            onClick: Function,
          },
          template:
            '<button type="button" class="card-stub" :data-app-name="appName" :data-disabled-reason="disabledReason" :data-link-title="linkTitle" @click="onClick" />',
        },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('MarketplaceAppCatalogView', () => {
  it('renders marketplace cards and navigates to the detail by FQN', async () => {
    mockedList.mockResolvedValue({
      data: [
        {
          name: 'DataInsightsApplication',
          fullyQualifiedName: 'DataInsightsApplication',
          displayName: 'Data Insights',
          description: 'Insights app',
          enabled: true,
        },
      ],
      total: 1,
    });
    const { wrapper, router } = await mountCatalog();
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 15 }),
    );
    const card = wrapper.find('.card-stub');
    expect(card.attributes('data-link-title')).toBe('Read More');
    await card.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('marketplace-app-detail');
    expect(router.currentRoute.value.params.fqn).toBe('DataInsightsApplication');
    wrapper.unmount();
  });

  it('passes the cache reason only when the NAME is the cache app', async () => {
    mockedList.mockResolvedValue({
      data: [
        { name: 'CacheWarmupApplication', fullyQualifiedName: 'CacheWarmupApplication', enabled: false },
        // FQN matches but the name does not: pin checks the name only.
        { name: 'OtherApp', fullyQualifiedName: 'CacheWarmupApplication', enabled: false },
      ],
      total: 2,
    });
    const { wrapper } = await mountCatalog();
    const cards = wrapper.findAll('.card-stub');
    expect(cards[0].attributes('data-disabled-reason')).toBe('Cache service not configured');
    expect(cards[1].attributes('data-disabled-reason')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders no empty or error UI when the catalog is empty', async () => {
    mockedList.mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = await mountCatalog();
    expect(wrapper.find('.card-stub').exists()).toBe(false);
    expect(wrapper.find('.pagination-stub').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });

  it('shows the forbidden view for non-admins without fetching', async () => {
    const { wrapper } = await mountCatalog(false);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(mockedList).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
