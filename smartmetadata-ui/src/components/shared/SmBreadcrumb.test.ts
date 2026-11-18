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
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import SmBreadcrumb from './SmBreadcrumb.vue';

async function mountBreadcrumb(items: Array<{ label: string; routeName?: string; routeParams?: Record<string, string> }>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
      {
        path: '/settings/:category',
        name: 'settings-category',
        component: { template: '<div>category</div>' },
      },
      {
        path: '/settings/preferences/dataAssetRules',
        name: 'settings-preferences-entity-rules',
        component: { template: '<div>rules</div>' },
      },
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(SmBreadcrumb, {
    props: { items },
    global: { plugins: [Antd, router] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('SmBreadcrumb', () => {
  it('renders nothing for an empty list', async () => {
    const { wrapper } = await mountBreadcrumb([]);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
  });

  it('links every item with a route name, including the last one (pin TitleBreadcrumb)', async () => {
    const { wrapper, router } = await mountBreadcrumb([
      { label: 'Settings', routeName: 'admin-settings' },
      { label: 'Preferences', routeName: 'settings-category', routeParams: { category: 'preferences' } },
      { label: 'Data Asset Rules Configuration', routeName: 'settings-preferences-entity-rules' },
    ]);
    const links = wrapper.findAll('a');
    expect(links).toHaveLength(3);
    expect(links[0].text()).toBe('Settings');
    expect(links[1].text()).toBe('Preferences');
    expect(links[2].text()).toBe('Data Asset Rules Configuration');
    await links[2].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-preferences-entity-rules');
  });

  it('renders items without a route name as plain text', async () => {
    const { wrapper } = await mountBreadcrumb([
      { label: 'Settings', routeName: 'admin-settings' },
      { label: 'Preferences', routeName: 'settings-category', routeParams: { category: 'preferences' } },
      { label: 'Theme' },
    ]);
    expect(wrapper.findAll('a')).toHaveLength(2);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').text()).toContain('Theme');
    const lastItem = wrapper.findAll('.ant-breadcrumb-link')[2];
    expect(lastItem.find('a').exists()).toBe(false);
    expect(lastItem.find('span').text()).toBe('Theme');
  });
});
