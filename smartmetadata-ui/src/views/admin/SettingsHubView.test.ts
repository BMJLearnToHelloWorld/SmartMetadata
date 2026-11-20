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
      { path: '/admin/users', name: 'admin-users', component: stub('users') },
      { path: '/admin/settings/system', name: 'admin-settings-system', component: stub('system') },
      {
        path: '/governance/classifications',
        name: 'governance-classifications',
        component: stub('tags'),
      },
      { path: '/connections', name: 'connections', component: stub('svc') },
      { path: '/admin/roles', name: 'admin-roles', component: stub('roles') },
      { path: '/admin/policies', name: 'admin-policies', component: stub('policies') },
      {
        path: '/admin/settings/custom-properties/:tab',
        name: 'admin-settings-custom-property-type',
        component: stub('def'),
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
      { path: '/admin/settings/audit-logs', name: 'admin-settings-audit-logs', component: stub('audit') },
      { path: '/admin/settings/permission-debugger', name: 'admin-settings-permission-debugger', component: stub('permdbg') },
      { path: '/admin/settings/governance/intake-forms', name: 'admin-settings-governance-intake-forms', component: stub('intake') },
      { path: '/admin/settings/governance/task-forms', name: 'admin-settings-governance-task-forms', component: stub('taskforms') },
      { path: '/admin/settings/governance/glossary-term-relations', name: 'admin-settings-governance-glossary-term-relations', component: stub('termrelations') },
      { path: '/insights/online-users', name: 'insights-online-users', component: stub('online') },
      { path: '/admin/users/admins', name: 'admin-admins', component: stub('admins') },
      { path: '/inbox', name: 'inbox', component: stub('inbox') },
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
}

async function mountHub(locale: 'en-US' | 'zh-CN' = 'en-US') {
  const router = testRouter();
  await router.push('/settings');
  await router.isReady();
  const wrapper = mount(SettingsHubView, {
    global: { plugins: [router, Antd, createTestI18n(locale)] },
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

beforeEach(() => {
  permissionFixture.isAdminUser = false;
  permissionFixture.authProvider = undefined;
  permissionFixture.opsByResource = {};
  permissionFixture.gate = null;
  permissionFixture.forceEmpty = false;
});

describe('SettingsHubView', () => {
  beforeEach(() => {
    // The merged hub filters categories by permission (shell design);
    // these sections cases were written against the unfiltered hub, so
    // they run as an admin with view grants, like the shell cases.
    permissionFixture.isAdminUser = true;
    allowAllView();
  });
  // 20s cap, not the 5s default: the first mount renders every category
  // card after the router setup, so under parallel workers it exceeds 5s
  // — and under peak VM load (load avg > 5 on 4 CPUs) even 10s. Baseline
  // was already ~4.0s single-run for this test, so the margin was gone
  // before this batch. Assertions are unchanged; the cap still fails a
  // genuinely hung mount.
  it('renders official-like category cards from the registry in pin order', async () => {
    const { wrapper } = await mountHub();
    expect(wrapper.find('[data-testid="settings-hub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-hub-title-heading"]').text()).toBe('Settings');
    expect(wrapper.find('[data-testid="settings-hub-grid"]').exists()).toBe(true);
    // One SettingItemCard per registry category, in pin order, keyed by the
    // category key only — the merged hub renders no per-link testids, so
    // the old settings-link-* assertions retarget to the card testids.
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
    expect(wrapper.find('[data-testid="members"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="access"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="customProperties"]').exists()).toBe(true);
    // No per-link testids survive on the merged hub (the shell it
    // 'renders no breadcrumb and no residual UI' asserts the same absence):
    // no users/teams/bots/classifications/login/email/appearance/services/
    // policies/custom-properties/audit-logs/persona links.
    expect(wrapper.find('[data-testid^="settings-link-"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-link-users"]').exists()).toBe(false);
    // P1: the standalone teams list page is deleted; teams live under
    // the members detail surface, so the hub has no teams link.
    expect(wrapper.find('[data-testid="settings-link-teams"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-link-custom-properties"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-link-audit-logs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-residual-audit-logs"]').exists()).toBe(false);
    // P2 B5: persona flipped residual → route; the hub shows a card, not a link.
    expect(wrapper.find('[data-testid="settings-residual-persona"]').exists()).toBe(false);
  }, 20000);

  // The merged hub navigates by route name through the registry-derived
  // path: the members card lands on the members category page, NOT
  // directly on the Users list. The Users list is one level down — the
  // members.users card on the category page navigates to it by name,
  // covered by SettingsCategoryView.test.ts
  // 'navigates a card to its discrete route by name' (admin-users).
  it('navigates a live card to its category page by name', async () => {
    const { wrapper, router } = await mountHub();
    await wrapper.find('[data-testid="members"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-category');
    expect(router.currentRoute.value.params).toEqual({ category: 'members' });
  });


function allowAllView(): void {
  permissionFixture.opsByResource = Object.fromEntries(
    ALL_VIEW_RESOURCES.map((key) => [key, { ViewAll: true }]),
  );
}

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
    // Non-admin: this describe nests under the sections describe, whose
    // beforeEach grants admin + full view; reset it here, as the shell
    // version relied on the top-level reset leaving isAdminUser false.
    permissionFixture.isAdminUser = false;
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

  // The hub has no per-type rows: the Custom Properties card lands on the
  // category page, where the 26 type cards live. Row-level navigation
  // (card → type detail with the tab segment) is covered by
  // SettingsCategoryView.test.ts
  // 'navigates a custom-properties card to the type page with the tab segment'
  // (customProperties.tables → admin-settings-custom-property-type, { tab: 'tables' }).
  it('navigates the custom-properties card to the category page by name', async () => {
    const { wrapper, router } = await mountHub();
    await wrapper.find('[data-testid="customProperties"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-category');
    expect(router.currentRoute.value.params).toEqual({ category: 'customProperties' });
  });

  it('shows residual sections as text, not fake forms or dead buttons', async () => {
    const { wrapper } = await mountHub();
    // Card-DOM equivalents of the old per-link assertions: apps and sso
    // are hub cards; appearance / search / profiler live under the
    // Preferences card; inbox has no card at all.
    expect(wrapper.find('[data-testid="apps"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sso"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preferences"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="inbox"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-link-apps"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-link-sso"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-residual-apps"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-residual-policies"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-residual-custom-properties"]').exists()).toBe(false);
    // 07 #14: the inbox hub item is deleted (the inbox route stays
    // reachable directly); no hub link and no residual entry render.
    expect(wrapper.find('[data-testid="settings-link-inbox"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-residual-inbox"]').exists()).toBe(false);
    // B5-8: SSO flipped residual → route.
    expect(wrapper.find('[data-testid="settings-residual-sso"]').exists()).toBe(false);
    // Appearance / search / profiler flipped residual → route (Preferences full-chain).
    expect(wrapper.find('[data-testid="settings-residual-appearance"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-link-appearance"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-link-search-settings"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-link-profiler"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Ontology');
    expect(wrapper.text()).not.toContain('Knowledge');
  });

  // 20s cap (same load evidence as the first test in this file). R-2: the
  // 26 custom-properties rows sort by rendered label at render time, so
  // the zh-CN order differs from the en-US order — but the rows live on
  // the category page, not the hub. The hub-level check is that the card
  // navigates to the category page in zh-CN; the sorting itself is
  // covered by SettingsCategoryView.test.ts
  // 'renders the customProperties cards sorted by rendered title (§6.2)'
  // and by src/settings/customProperties.test.ts
  // 'sorts entries by rendered label at render time, per locale (R-2)',
  // which asserts the zh-CN order is localeCompare-sorted and differs
  // from the en-US order.
  it('navigates the custom-properties card to the category page in zh-CN (R-2 sorting lives on the category page)', async () => {
    const { wrapper, router } = await mountHub('zh-CN');
    const card = wrapper.find('[data-testid="customProperties"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-category');
    expect(router.currentRoute.value.params).toEqual({ category: 'customProperties' });
  }, 20000);

});
