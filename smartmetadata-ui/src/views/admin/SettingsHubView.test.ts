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
import { createTestI18n } from '@/test/i18n';
import SettingsHubView from './SettingsHubView.vue';

async function mountHub() {
  const i18n = createTestI18n('en-US');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/settings', name: 'admin-settings', component: SettingsHubView },
      { path: '/admin/apps', name: 'admin-apps', component: { template: '<div>apps</div>' } },
      { path: '/admin/users', name: 'admin-users', component: { template: '<div>users</div>' } },
      { path: '/admin/teams', name: 'admin-teams', component: { template: '<div>teams</div>' } },
      { path: '/admin/bots', name: 'admin-bots', component: { template: '<div>bots</div>' } },
      { path: '/admin/settings/system', name: 'admin-settings-system', component: { template: '<div>system</div>' } },
      {
        path: '/governance/classifications',
        name: 'governance-classifications',
        component: { template: '<div>tags</div>' },
      },
      { path: '/ingestion/services', name: 'ingestion-services', component: { template: '<div>svc</div>' } },
      { path: '/admin/roles', name: 'admin-roles', component: { template: '<div>roles</div>' } },
      { path: '/admin/policies', name: 'admin-policies', component: { template: '<div>policies</div>' } },
      {
        path: '/admin/settings/custom-properties',
        name: 'admin-settings-custom-properties',
        component: { template: '<div>defs</div>' },
      },
      { path: '/governance/glossaries', name: 'governance-glossaries', component: { template: '<div>glos</div>' } },
      { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>dom</div>' } },
      {
        path: '/governance/data-products',
        name: 'governance-data-products',
        component: { template: '<div>dp</div>' },
      },
      { path: '/ingestion/pipelines', name: 'ingestion-pipelines', component: { template: '<div>pipe</div>' } },
      { path: '/observability/alerts', name: 'observability-alerts', component: { template: '<div>al</div>' } },
      { path: '/announcements', name: 'announcements', component: { template: '<div>ann</div>' } },
    ],
  });
  await router.push('/admin/settings');
  await router.isReady();
  const wrapper = mount(SettingsHubView, {
    global: {
      plugins: [router, Antd, i18n],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('SettingsHubView', () => {
  it('renders official-like category cards and live links to existing pages', async () => {
    const { wrapper } = await mountHub();
    expect(wrapper.find('[data-testid="settings-hub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-hub-title"]').text()).toBe('Settings');
    expect(wrapper.find('[data-testid="settings-category-members"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-category-access"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-users"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-teams"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-bots"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-classifications"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-system"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-services"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-policies"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-custom-properties"]').exists()).toBe(true);
  });

  it('navigates a live card to the existing Users list', async () => {
    const { wrapper, router } = await mountHub();
    await wrapper.find('[data-testid="settings-link-users"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-users');
  });

  it('shows residual sections as text, not fake forms or dead buttons', async () => {
    const { wrapper } = await mountHub();
    expect(wrapper.find('[data-testid="settings-link-apps"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-residual-apps"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-residual-policies"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-residual-custom-properties"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-residual-inbox"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-residual-sso"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-residual-appearance"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Ontology');
    expect(wrapper.text()).not.toContain('Knowledge');
  });
});
