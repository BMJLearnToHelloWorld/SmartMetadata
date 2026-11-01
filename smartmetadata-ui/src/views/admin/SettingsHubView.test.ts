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

const stub = (label: string) => ({ template: `<div>${label}</div>` });

async function mountHub() {
  const i18n = createTestI18n('en-US');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/settings', name: 'admin-settings', component: SettingsHubView },
      { path: '/admin/apps', name: 'admin-apps', component: stub('apps') },
      { path: '/admin/users', name: 'admin-users', component: stub('users') },
      { path: '/admin/teams', name: 'admin-teams', component: stub('teams') },
      { path: '/admin/bots', name: 'admin-bots', component: stub('bots') },
      { path: '/admin/settings/system', name: 'admin-settings-system', component: stub('system') },
      {
        path: '/governance/classifications',
        name: 'governance-classifications',
        component: stub('tags'),
      },
      { path: '/ingestion/services', name: 'ingestion-services', component: stub('svc') },
      { path: '/admin/roles', name: 'admin-roles', component: stub('roles') },
      { path: '/admin/policies', name: 'admin-policies', component: stub('policies') },
      {
        path: '/admin/settings/custom-properties',
        name: 'admin-settings-custom-properties',
        component: stub('defs'),
      },
      { path: '/governance/glossaries', name: 'governance-glossaries', component: stub('glos') },
      { path: '/governance/domains', name: 'governance-domains', component: stub('dom') },
      {
        path: '/governance/data-products',
        name: 'governance-data-products',
        component: stub('dp'),
      },
      { path: '/ingestion/pipelines', name: 'ingestion-pipelines', component: stub('pipe') },
      { path: '/observability/alerts', name: 'observability-alerts', component: stub('al') },
      { path: '/announcements', name: 'announcements', component: stub('ann') },
      // Preferences residual→route (BACKEND_09 / hub pattern)
      { path: '/admin/settings/preferences/appearance', name: 'settings-preferences-appearance', component: stub('appearance') },
      { path: '/admin/settings/preferences/email', name: 'settings-preferences-email', component: stub('email') },
      { path: '/admin/settings/preferences/login', name: 'settings-preferences-login', component: stub('login') },
      { path: '/admin/settings/preferences/health', name: 'settings-preferences-health', component: stub('health') },
      { path: '/admin/settings/preferences/profiler', name: 'settings-preferences-profiler', component: stub('profiler') },
      { path: '/admin/settings/preferences/dq-dimensions', name: 'settings-preferences-dq-dimensions', component: stub('dq') },
      { path: '/admin/settings/preferences/search', name: 'settings-preferences-search', component: stub('search') },
      { path: '/admin/settings/preferences/lineage', name: 'settings-preferences-lineage', component: stub('lineage') },
      { path: '/admin/settings/preferences/om-url', name: 'settings-preferences-om-url', component: stub('omurl') },
      { path: '/admin/settings/preferences/entity-rules', name: 'settings-preferences-entity-rules', component: stub('rules') },
      { path: '/admin/settings/preferences/learning', name: 'settings-preferences-learning', component: stub('learn') },
      { path: '/admin/settings/preferences/app-mode', name: 'settings-preferences-app-mode', component: stub('mode') },
      { path: '/admin/settings/preferences/glossary', name: 'settings-preferences-glossary', component: stub('gloss') },
      { path: '/admin/settings/preferences/time-format', name: 'settings-preferences-time-format', component: stub('time') },
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
    expect(wrapper.find('[data-testid="settings-hub-title-heading"]').text()).toBe('Settings');
    expect(wrapper.find('[data-testid="settings-category-members"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-category-access"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-users"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-teams"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-bots"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-classifications"]').exists()).toBe(true);
    // Combined Preferences "system" card removed; login/email are separate routes.
    expect(wrapper.find('[data-testid="settings-link-login"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-email"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-appearance"]').exists()).toBe(true);
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
    // Appearance / search / profiler flipped residual → route (Preferences full-chain).
    expect(wrapper.find('[data-testid="settings-residual-appearance"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-link-appearance"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-search-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-link-profiler"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Ontology');
    expect(wrapper.text()).not.toContain('Knowledge');
  });
});
