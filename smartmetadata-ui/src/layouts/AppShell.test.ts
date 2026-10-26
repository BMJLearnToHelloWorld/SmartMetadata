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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { LOCALE_STORAGE_KEY } from '@/i18n/localePreference';
import { createTestI18n } from '@/test/i18n';
import AppShell from './AppShell.vue';

async function mountShell(locale: 'en-US' | 'zh-CN' = 'en-US') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createTestI18n(locale);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: AppShell,
        children: [
          { path: '', redirect: { name: 'home' } },
          { path: 'my-data', name: 'home', component: { template: '<div>home</div>' }, meta: { flush: true } },
          { path: 'search', name: 'search', component: { template: '<div>search</div>' } },
          { path: 'lineage', name: 'lineage-home', component: { template: '<div>lineage</div>' } },
          { path: 'insights', name: 'insights', component: { template: '<div>insights</div>' } },
          {
            path: 'quality/test-cases',
            name: 'quality-test-cases',
            component: { template: '<div>tc</div>' },
          },
          {
            path: 'quality/test-definitions',
            name: 'quality-test-definitions',
            component: { template: '<div>td</div>' },
          },
          {
            path: 'observability/incidents',
            name: 'observability-incidents',
            component: { template: '<div>inc</div>' },
          },
          { path: 'marketplace', name: 'marketplace-overview', component: { template: '<div>mkt</div>' } },
          { path: 'governance/domains', name: 'governance-domains', component: { template: '<div>dom</div>' } },
          { path: 'governance/metrics', name: 'governance-metrics', component: { template: '<div>met</div>' } },
          { path: 'context-center', name: 'context-center-overview', component: { template: '<div>cc</div>' } },
          { path: 'login', name: 'login', component: { template: '<div>login</div>' } },
          { path: 'admin/settings', name: 'admin-settings', component: { template: '<div>settings</div>' } },
          { path: 'admin/users/:id', name: 'admin-user', component: { template: '<div>profile</div>' } },
        ],
      },
    ],
  });
  await router.push('/search');
  await router.isReady();
  const wrapper = mount(AppShell, {
    global: {
      plugins: [pinia, router, Antd, i18n],
    },
  });
  await flushPromises();
  return { wrapper, i18n, router };
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders reference left-nav groups, child labels, and footer Settings/Logout', async () => {
    const { wrapper } = await mountShell();
    expect(wrapper.text()).toContain('Home');
    expect(wrapper.text()).toContain('Explore');
    expect(wrapper.text()).toContain('Lineage');
    expect(wrapper.text()).toContain('Observability');
    expect(wrapper.text()).toContain('Data Quality');
    expect(wrapper.text()).toContain('Incident Manager');
    expect(wrapper.text()).toContain('Test Library');
    expect(wrapper.text()).toContain('Insights');
    expect(wrapper.text()).toContain('Data Marketplace');
    expect(wrapper.text()).toContain('Govern');
    expect(wrapper.text()).toContain('Glossary');
    expect(wrapper.text()).toContain('Ontology Explorer');
    expect(wrapper.text()).toContain('Column Bulk Ops (Beta)');
    expect(wrapper.text()).toContain('Context Center');
    expect(wrapper.find('[data-testid="observability-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="quality-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="marketplace-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="governance-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="context-center-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ingestion-nav"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="collaboration-nav"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-nav"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="nav-settings"]').text()).toContain('Settings');
    expect(wrapper.find('[data-testid="nav-logout"]').text()).toContain('Logout');
    expect(wrapper.find('[data-testid="locale-switcher"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="global-search"]').exists()).toBe(true);
    expect(wrapper.find('.shell__search input').attributes('placeholder')).toBe(
      'Search for Data Assets',
    );
    expect(wrapper.find('[data-testid="user-menu-trigger"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="notifications-button"]').exists()).toBe(false);
    expect(wrapper.find('.shell__sider').classes().join(' ')).not.toContain('ant-layout-sider-dark');
    await wrapper.find('[data-testid="user-menu-trigger"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="logout-button"]').text()).toBe('Logout');
  });

  it('switches locale, persists sm.locale.v1, and relabels chrome', async () => {
    const { wrapper, i18n } = await mountShell('en-US');
    i18n.global.locale.value = 'zh-CN';
    localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('探索');
    await wrapper.find('[data-testid="user-menu-trigger"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="logout-button"]').text()).toBe('退出');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN');
  });

  it('keeps Explore facet query params when the header search runs', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({ name: 'search', query: { q: 'orders', entityType: 'table' } });
    await flushPromises();
    const search = wrapper.find('.shell__search input');
    expect(search.exists()).toBe(true);
    await search.setValue('customers');
    await search.trigger('keydown.enter');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ q: 'customers', entityType: 'table' });
  });

  it('opens Settings from the user menu and profile only when loggedInUser has an id', async () => {
    const { wrapper, router } = await mountShell();
    const { useAuthStore } = await import('@/stores/auth');
    const auth = useAuthStore();
    auth.user = { id: 'u-1', name: 'alice', displayName: 'Alice' };
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="user-menu-trigger"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="user-profile-item"]').exists()).toBe(true);
    await wrapper.find('[data-testid="user-settings-item"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings');
    await wrapper.find('[data-testid="user-menu-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="user-profile-item"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-user');
    expect(router.currentRoute.value.params.id).toBe('u-1');
  });

  it('hides the header search on My Data so the hero owns search', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({ name: 'home' });
    await flushPromises();
    expect(wrapper.find('[data-testid="global-search"]').exists()).toBe(false);
    expect(wrapper.find('.shell__content--flush').exists()).toBe(true);
    await router.push({ name: 'search' });
    await flushPromises();
    expect(wrapper.find('[data-testid="global-search"]').exists()).toBe(true);
  });

  it('opens Observability when a quality route is active', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({ name: 'quality-test-cases' });
    await flushPromises();
    expect(wrapper.vm).toBeTruthy();
    const selected = wrapper.find('.ant-menu-item-selected');
    expect(selected.exists()).toBe(true);
    expect(selected.text()).toContain('Data Quality');
  });

  it('navigates Settings from the sider footer and logs out from nav-logout', async () => {
    const { wrapper, router } = await mountShell();
    await wrapper.find('[data-testid="nav-settings"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings');
    await wrapper.find('[data-testid="nav-logout"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('login');
  });
});
