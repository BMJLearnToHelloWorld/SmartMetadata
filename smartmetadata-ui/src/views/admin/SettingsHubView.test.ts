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
import Antd, { Row } from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import type { OperationPermissions } from '@/api/permissions';
import { createTestI18n } from '@/test/i18n';
import SettingsHubView from './SettingsHubView.vue';

const permissionFixture = {
  isAdminUser: false,
  authProvider: undefined as string | undefined,
  opsByResource: {} as Record<string, OperationPermissions>,
  /** When set, permission lookups wait on this gate until the test releases it. */
  gate: null as Promise<void> | null,
  /** Forces the filter to report zero visible categories (see the empty-state test). */
  forceEmpty: false,
};

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    get isAdminUser() {
      return permissionFixture.isAdminUser;
    },
    getResourcePermission: async (resourceKey: string) => {
      if (permissionFixture.gate) {
        await permissionFixture.gate;
      }
      return permissionFixture.opsByResource[resourceKey] ?? {};
    },
  }),
}));

vi.mock('@/settings/permissionRules', async (importOriginal) => {
  const original = (await importOriginal()) as typeof import('@/settings/permissionRules');
  return {
    ...original,
    loadAuthProvider: async () => permissionFixture.authProvider,
    filterVisibleSettingsItems: async (
      ...args: Parameters<typeof original.filterVisibleSettingsItems>
    ) => (permissionFixture.forceEmpty ? [] : original.filterVisibleSettingsItems(...args)),
  };
});

const stub = (label: string) => ({ template: `<div>${label}</div>` });

function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: SettingsHubView },
      { path: '/settings/:category', name: 'settings-category', component: stub('category') },
      { path: '/settings/apps', name: 'admin-apps', component: stub('apps') },
      { path: '/settings/bots', name: 'admin-bots', component: stub('bots') },
      { path: '/settings/persona', name: 'admin-settings-persona', component: stub('persona') },
      { path: '/settings/sso', name: 'admin-settings-sso', component: stub('sso') },
    ],
  });
}

async function mountHub() {
  const router = testRouter();
  await router.push('/settings');
  await router.isReady();
  const wrapper = mount(SettingsHubView, {
    global: { plugins: [router, Antd, createTestI18n('en-US')] },
  });
  await flushPromises();
  return { wrapper, router };
}

const ALL_VIEW_RESOURCES = [
  'databaseService',
  'messagingService',
  'dashboardService',
  'pipelineService',
  'mlmodelService',
  'metadataService',
  'storageService',
  'searchService',
  'apiService',
  'driveService',
  'eventsubscription',
  'team',
  'user',
  'role',
  'policy',
];

function allowAllView(): void {
  permissionFixture.opsByResource = Object.fromEntries(
    ALL_VIEW_RESOURCES.map((key) => [key, { ViewAll: true }]),
  );
}

beforeEach(() => {
  permissionFixture.isAdminUser = false;
  permissionFixture.authProvider = undefined;
  permissionFixture.opsByResource = {};
  permissionFixture.gate = null;
  permissionFixture.forceEmpty = false;
});

describe('SettingsHubView (DESIGN §5)', () => {
  it('renders all eleven category cards in pin order for an admin with view grants', async () => {
    permissionFixture.isAdminUser = true;
    allowAllView();
    const { wrapper } = await mountHub();
    const cards = wrapper.findAll('[data-testid="settings-hub-grid"] .setting-item-card');
    expect(cards.map((card) => card.attributes('data-testid'))).toEqual([
      'services',
      'apps',
      'notifications',
      'members',
      'access',
      'preferences',
      'customProperties',
      'bots',
      'persona',
      'sso',
      'governance',
    ]);
  });

  it('renders the pin header with the learning icon and the brand description', async () => {
    permissionFixture.isAdminUser = true;
    allowAllView();
    const { wrapper } = await mountHub();
    expect(wrapper.find('[data-testid="settings-hub-title-heading"]').text()).toBe('Settings');
    expect(wrapper.find('[data-testid="settings-hub-title-sub"]').text()).toBe(
      'Ability to configure the iSmart application to suit your needs.',
    );
    expect(wrapper.find('[data-testid="settings-hub-title-learning"]').exists()).toBe(true);
  });

  it('renders no breadcrumb and no residual UI', async () => {
    permissionFixture.isAdminUser = true;
    allowAllView();
    const { wrapper } = await mountHub();
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid^="settings-residual"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid^="settings-link-"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-service-button"]').exists()).toBe(false);
  });

  it('uses the 1/2/3-column grid with a 20px gutter', async () => {
    permissionFixture.isAdminUser = true;
    allowAllView();
    const { wrapper } = await mountHub();
    expect(wrapper.findComponent(Row).props('gutter')).toEqual([20, 20]);
    const cols = wrapper.findAll('.ant-col');
    expect(cols).toHaveLength(11);
    for (const col of cols) {
      expect(col.classes()).toContain('ant-col-xs-24');
      expect(col.classes()).toContain('ant-col-md-12');
      expect(col.classes()).toContain('ant-col-lg-8');
    }
  });

  it('filters categories by the two-stage permission rule', async () => {
    // Only user/team visibility: members survives (users/admins), services
    // survives (dataObservability is always visible), everything else drops.
    permissionFixture.opsByResource = { team: { ViewAll: true }, user: { ViewAll: true } };
    const { wrapper } = await mountHub();
    const cards = wrapper.findAll('[data-testid="settings-hub-grid"] .setting-item-card');
    expect(cards.map((card) => card.attributes('data-testid'))).toEqual(['services', 'members']);
  });

  it('renders only the shared placeholder when zero categories are visible (§5.4)', async () => {
    // The real registry always leaves `services` visible (dataObservability
    // is always protected, pin-identical), so the empty branch is exercised
    // by forcing the filter result; the filter's own semantics are covered
    // by permissionRules.test.ts. The assertion target is the view's
    // branch: placeholder alone, no header, no grid, no redirect.
    permissionFixture.forceEmpty = true;
    const { wrapper, router } = await mountHub();
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').text()).toContain(
      'get the Settings permission.',
    );
    expect(wrapper.find('[data-testid="settings-hub-title"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-hub-grid"]').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
    expect(router.currentRoute.value.name).toBe('admin-settings');
  });

  it('shows only a loading state until the permission evaluation resolves (§11.1)', async () => {
    let release: () => void = () => {};
    permissionFixture.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    permissionFixture.isAdminUser = true;
    allowAllView();
    const router = testRouter();
    await router.push('/settings');
    await router.isReady();
    const wrapper = mount(SettingsHubView, {
      global: { plugins: [router, Antd, createTestI18n('en-US')] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="settings-hub-loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-hub-grid"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
    release();
    await flushPromises();
    expect(wrapper.find('[data-testid="settings-hub-loading"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="settings-hub-grid"] .setting-item-card')).toHaveLength(11);
  });

  it('navigates a multi-card category to the category page by name', async () => {
    permissionFixture.isAdminUser = true;
    allowAllView();
    const { wrapper, router } = await mountHub();
    await wrapper.find('[data-testid="members"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-category');
    expect(router.currentRoute.value.params).toEqual({ category: 'members' });
  });

  it('navigates a single-card category straight to its discrete route (§6.5)', async () => {
    permissionFixture.isAdminUser = true;
    allowAllView();
    const { wrapper, router } = await mountHub();
    await wrapper.find('[data-testid="apps"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-apps');
  });
});
