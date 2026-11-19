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
import Antd, { Tooltip } from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import type { OperationPermissions } from '@/api/permissions';
import { createTestI18n } from '@/test/i18n';
import SettingsCategoryView from './SettingsCategoryView.vue';

const permissionFixture = {
  isAdminUser: false,
  authProvider: undefined as string | undefined,
  opsByResource: {} as Record<string, OperationPermissions>,
  failResources: new Set<string>(),
};

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    get isAdminUser() {
      return permissionFixture.isAdminUser;
    },
    getResourcePermission: async (resourceKey: string) => {
      if (permissionFixture.failResources.has(resourceKey)) {
        throw new Error(`denied: ${resourceKey}`);
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
  };
});

/** The limit gate itself is covered by LimitWrapper.test.ts; here only the wrapping is asserted. */
const LimitWrapperStub = {
  name: 'LimitWrapper',
  props: { resource: { type: String, required: true } },
  template: '<div><slot :limitReached="false" /></div>',
};

const stub = (label: string) => ({ template: `<div>${label}</div>` });

function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: stub('hub') },
      { path: '/settings/:category', name: 'settings-category', component: SettingsCategoryView },
      { path: '/settings/services/:tab', name: 'settings-services', component: stub('svc-list') },
      { path: '/settings/members/teams', name: 'admin-teams', component: stub('teams') },
      { path: '/settings/members/users', name: 'admin-users', component: stub('users') },
      {
        path: '/settings/preferences/search-settings',
        name: 'settings-preferences-search',
        component: stub('search'),
      },
      {
        path: '/settings/customProperties/:tab',
        name: 'admin-settings-custom-property-type',
        component: stub('cp-type'),
      },
      { path: '/ingestion/services/add', name: 'ingestion-service-add', component: stub('add') },
    ],
  });
}

async function mountCategory(path: string) {
  const router = testRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(SettingsCategoryView, {
    global: {
      plugins: [router, Antd, createTestI18n('en-US')],
      stubs: { LimitWrapper: LimitWrapperStub },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function allowAllView(): void {
  permissionFixture.opsByResource = Object.fromEntries(
    [
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
    ].map((key) => [key, { ViewAll: true }]),
  );
}

beforeEach(() => {
  permissionFixture.isAdminUser = false;
  permissionFixture.authProvider = undefined;
  permissionFixture.opsByResource = {};
  permissionFixture.failResources = new Set();
});

describe('SettingsCategoryView (DESIGN §6)', () => {
  it('renders the breadcrumb, header and filtered entry cards for a category', async () => {
    allowAllView();
    const { wrapper } = await mountCategory('/settings/members');
    expect(wrapper.find('[data-testid="settings-category-title-heading"]').text()).toBe(
      'Team & User Management',
    );
    expect(wrapper.find('[data-testid="settings-category-title-sub"]').text()).toContain(
      'Streamline access to users and teams',
    );
    expect(wrapper.find('[data-testid="members.teams"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="members.users"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="members.admins"]').exists()).toBe(true);
    // Online Users is admin-only: invisible to a non-admin with view grants.
    expect(wrapper.find('[data-testid="members.online-users"]').exists()).toBe(false);
    // No learning icon on a category header (pin has none here).
    expect(wrapper.find('[data-testid="settings-category-title-learning"]').exists()).toBe(false);
  });

  it('renders the breadcrumb as Settings > category with the category crumb unlinked', async () => {
    allowAllView();
    const { wrapper } = await mountCategory('/settings/members');
    const crumb = wrapper.find('[data-testid="sm-breadcrumb"]');
    expect(crumb.text()).toContain('Settings');
    expect(crumb.text()).toContain('Members');
    const links = crumb.findAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].text()).toBe('Settings');
  });

  it('hides entries whose permission rule fails and fails closed on fetch errors', async () => {
    permissionFixture.opsByResource = { team: { ViewAll: true } };
    permissionFixture.failResources = new Set(['user']);
    const { wrapper } = await mountCategory('/settings/members');
    expect(wrapper.find('[data-testid="members.teams"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="members.users"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="members.admins"]').exists()).toBe(false);
  });

  it('renders header plus an empty grid with no placeholder when nothing is visible (D-12)', async () => {
    const { wrapper } = await mountCategory('/settings/members');
    expect(wrapper.find('[data-testid="settings-category-title-heading"]').text()).toBe(
      'Team & User Management',
    );
    expect(wrapper.find('[data-testid="settings-category-grid"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
  });

  it('renders the pin empty page for an unknown category (D-10)', async () => {
    const { wrapper, router } = await mountCategory('/settings/nope');
    expect(router.currentRoute.value.name).toBe('settings-category');
    expect(wrapper.find('[data-testid="settings-category-title-heading"]').text()).toBe('');
    expect(wrapper.find('[data-testid="settings-category-grid"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-category-grid"]').text()).toBe('');
    const crumb = wrapper.find('[data-testid="sm-breadcrumb"]');
    expect(crumb.findAll('a')).toHaveLength(1);
  });

  it('renders the customProperties cards sorted by rendered title (§6.2)', async () => {
    permissionFixture.isAdminUser = true;
    const { wrapper } = await mountCategory('/settings/customProperties');
    const cards = wrapper.findAll('.setting-item-card');
    expect(cards).toHaveLength(26);
    const titles = cards.map((card) => card.find('.setting-item-card__title').text());
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    expect(wrapper.find('[data-testid="customProperties.tables"]').exists()).toBe(true);
  });

  it('navigates a card to its discrete route by name', async () => {
    allowAllView();
    const { wrapper, router } = await mountCategory('/settings/members');
    await wrapper.find('[data-testid="members.users"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-users');
  });

  it('navigates the teams card to the teams list route (registry target descriptor)', async () => {
    allowAllView();
    const { wrapper, router } = await mountCategory('/settings/members');
    await wrapper.find('[data-testid="members.teams"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-teams');
  });

  it('navigates a services card to the category list route with the tab segment', async () => {
    allowAllView();
    const { wrapper, router } = await mountCategory('/settings/services');
    await wrapper.find('[data-testid="services.databases"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-services');
    expect(router.currentRoute.value.params).toEqual({ tab: 'databases' });
  });

  it('navigates a custom-properties card to the type page with the tab segment', async () => {
    permissionFixture.isAdminUser = true;
    const { wrapper, router } = await mountCategory('/settings/customProperties');
    await wrapper.find('[data-testid="customProperties.tables"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings-custom-property-type');
    expect(router.currentRoute.value.params).toEqual({ tab: 'tables' });
  });

  it('uses the 1/2/3-column grid breakpoints (768/992)', async () => {
    allowAllView();
    const { wrapper } = await mountCategory('/settings/members');
    const cols = wrapper.findAll('.ant-col');
    expect(cols.length).toBeGreaterThan(0);
    for (const col of cols) {
      expect(col.classes()).toContain('ant-col-xs-24');
      expect(col.classes()).toContain('ant-col-md-12');
      expect(col.classes()).toContain('ant-col-lg-8');
    }
  });

  it('shows the Add Service button only on the services category, wrapped in LimitWrapper', async () => {
    permissionFixture.opsByResource = { databaseService: { Create: true } };
    const services = await mountCategory('/settings/services');
    const button = services.wrapper.find('[data-testid="add-service-button"]');
    expect(button.exists()).toBe(true);
    const limitWrapper = services.wrapper.findComponent(LimitWrapperStub);
    expect(limitWrapper.exists()).toBe(true);
    expect(limitWrapper.props('resource')).toBe('dataAssets');
    const members = await mountCategory('/settings/members');
    expect(members.wrapper.find('[data-testid="add-service-button"]').exists()).toBe(false);
    expect(members.wrapper.find('[data-testid="add-service-skeleton"]').exists()).toBe(false);
  });

  it('keeps the Tooltip with the no-permission title when creation is not allowed', async () => {
    const { wrapper } = await mountCategory('/settings/services');
    expect(wrapper.find('[data-testid="add-service-button"]').exists()).toBe(false);
    const tooltip = wrapper.findComponent(Tooltip);
    expect(tooltip.exists()).toBe(true);
    expect(tooltip.props('title')).toBe(
      'You do not have the necessary permissions to perform this action.',
    );
    expect(tooltip.props('placement')).toBe('left');
  });

  it('titles the Tooltip with Add New Service when creation is allowed', async () => {
    permissionFixture.opsByResource = { apiService: { Create: true } };
    const { wrapper } = await mountCategory('/settings/services');
    expect(wrapper.find('[data-testid="add-service-button"]').exists()).toBe(true);
    expect(wrapper.findComponent(Tooltip).props('title')).toBe('Add New Service');
  });

  it('fails the button closed when every Create lookup fails', async () => {
    permissionFixture.failResources = new Set([
      'databaseService',
      'messagingService',
      'dashboardService',
      'pipelineService',
      'mlmodelService',
      'metadataService',
      'storageService',
      'searchService',
      'apiService',
      'securityService',
      'driveService',
    ]);
    const { wrapper } = await mountCategory('/settings/services');
    expect(wrapper.find('[data-testid="add-service-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-service-skeleton"]').exists()).toBe(false);
  });

  it('navigates the Add Service button to the retained wizard route by name (D-17)', async () => {
    permissionFixture.opsByResource = { databaseService: { Create: true } };
    const { wrapper, router } = await mountCategory('/settings/services');
    await wrapper.find('[data-testid="add-service-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service-add');
  });
});
