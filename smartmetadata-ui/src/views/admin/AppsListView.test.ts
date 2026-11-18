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
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { getApplicationList } from '@/api/apps';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import AppsListView from './AppsListView.vue';

vi.mock('@/api/apps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/apps')>();
  return { ...actual, getApplicationList: vi.fn() };
});

const mockedList = vi.mocked(getApplicationList);

const MESSAGES = {
  en: {
    label: {
      'setting-plural': 'Settings',
      'application-plural': 'Applications',
      'extend-open-meta-data': 'Extend OpenMetadata',
      disabled: 'Disabled',
      'add-entity': 'Add {entity}',
      'app-plural': 'Apps',
      configure: 'Configure',
      'page-plural': 'Pages',
      page: 'Page',
      of: 'of',
      previous: 'Previous',
      next: 'Next',
    },
    message: {
      'application-to-improve-data': 'Applications to improve data',
      'no-installed-applications-found': 'No installed applications found',
      'cache-service-not-configured-message': 'Cache service not configured',
    },
  },
};

const DUMMY = { template: '<div />' };

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/settings', name: 'admin-settings', component: DUMMY },
      { path: '/admin/apps', name: 'admin-apps', component: DUMMY },
      { path: '/admin/apps/:fqn', name: 'admin-app', component: DUMMY },
      { path: '/marketplace/apps', name: 'marketplace-app-catalog', component: DUMMY },
    ],
  });
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { name: 'admin' } as LoginUser;
  const router = makeRouter();
  await router.push('/admin/apps');
  await router.isReady();
  const wrapper = mount(AppsListView, {
    global: {
      plugins: [Antd, pinia, router, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
      stubs: {
        PageHeader: { template: '<div class="page-header-stub" />' },
        SmBreadcrumb: { template: '<div class="breadcrumb-stub" />' },
        NoDataPlaceholder: {
          props: { description: String, testId: String },
          template:
            '<div class="no-data-stub" :data-testid="testId" :data-description="description" />',
        },
        LimitWrapper: {
          template: '<div><slot :limit-reached="false" /></div>',
        },
        ApplicationCard: {
          props: {
            appName: String,
            deleted: Boolean,
            description: String,
            disabled: Boolean,
            disabledReason: String,
            linkTitle: String,
            showDescription: Boolean,
            title: String,
            onClick: Function,
          },
          template:
            '<button type="button" class="card-stub" :data-app-name="appName" :data-disabled-reason="disabledReason" @click="onClick" />',
        },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

const APP = {
  id: 'a1',
  name: 'SearchIndexingApplication',
  fullyQualifiedName: 'SearchIndexingApplication',
  displayName: 'Search Indexing',
  description: 'Indexes entities',
  enabled: true,
  deleted: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('AppsListView', () => {
  it('fetches non-deleted apps and navigates to the detail by FQN', async () => {
    mockedList.mockResolvedValue({ data: [APP], total: 1 });
    const { wrapper, router } = await mountView();
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ include: 'non-deleted', limit: 15 }),
    );
    const card = wrapper.find('.card-stub');
    expect(card.attributes('data-app-name')).toBe('SearchIndexingApplication');
    await card.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-app');
    expect(router.currentRoute.value.params.fqn).toBe('SearchIndexingApplication');
    wrapper.unmount();
  });

  it('passes the cache-warmup disabled reason only for the cache app', async () => {
    mockedList.mockResolvedValue({
      data: [
        { ...APP, name: 'CacheWarmupApplication', fullyQualifiedName: 'CacheWarmupApplication', enabled: false },
        { ...APP, name: 'OtherApp', fullyQualifiedName: 'OtherApp', enabled: false },
      ],
      total: 2,
    });
    const { wrapper } = await mountView();
    const cards = wrapper.findAll('.card-stub');
    expect(cards[0].attributes('data-disabled-reason')).toBe('Cache service not configured');
    expect(cards[1].attributes('data-disabled-reason')).toBeUndefined();
    wrapper.unmount();
  });

  it('refetches with include=deleted when the Disabled toggle flips', async () => {
    mockedList.mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = await mountView();
    mockedList.mockClear();
    await wrapper.find('[data-testid="show-disabled"]').trigger('click');
    await flushPromises();
    expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ include: 'deleted' }));
    wrapper.unmount();
  });

  it('shows the described empty placeholder, bare when showDisabled', async () => {
    mockedList.mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = await mountView();
    const placeholder = wrapper.find('.no-data-stub');
    expect(placeholder.attributes('data-testid')).toBe('no-data-placeholder');
    expect(placeholder.attributes('data-description')).toBe('No installed applications found');
    await wrapper.find('[data-testid="show-disabled"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('.no-data-stub').attributes('data-description')).toBeUndefined();
    wrapper.unmount();
  });

  it('navigates to the marketplace catalog from the Add button', async () => {
    mockedList.mockResolvedValue({ data: [], total: 0 });
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="add-application"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('marketplace-app-catalog');
    wrapper.unmount();
  });
});
