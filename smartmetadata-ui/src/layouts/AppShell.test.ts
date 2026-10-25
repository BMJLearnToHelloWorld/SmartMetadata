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
          { path: '', redirect: { name: 'search' } },
          { path: 'search', name: 'search', component: { template: '<div>search</div>' } },
          { path: 'lineage', name: 'lineage-home', component: { template: '<div>lineage</div>' } },
          {
            path: 'quality/test-cases',
            name: 'quality-test-cases',
            component: { template: '<div>tc</div>' },
          },
          { path: 'login', name: 'login', component: { template: '<div>login</div>' } },
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

  it('renders Explore (not Search) and groups quality under Observability', async () => {
    const { wrapper } = await mountShell();
    expect(wrapper.text()).toContain('Explore');
    expect(wrapper.text()).toContain('Lineage');
    expect(wrapper.text()).toContain('Observability');
    expect(wrapper.find('[data-testid="governance-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="observability-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="quality-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="locale-switcher"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="logout-button"]').text()).toBe('Log out');
  });

  it('switches locale, persists sm.locale.v1, and relabels chrome', async () => {
    const { wrapper, i18n } = await mountShell('en-US');
    i18n.global.locale.value = 'zh-CN';
    localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('探索');
    expect(wrapper.find('[data-testid="logout-button"]').text()).toBe('退出登录');
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

  it('opens Observability when a quality route is active', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({ name: 'quality-test-cases' });
    await flushPromises();
    expect(wrapper.vm).toBeTruthy();
    const selected = wrapper.find('.ant-menu-item-selected');
    expect(selected.exists()).toBe(true);
  });
});
