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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import type { CatalogService, ServiceKind } from '@/types/ingestion';
import type { SupportedLocale } from '@/i18n/localePreference';
import { createTestI18n } from '@/test/i18n';
import SettingsServicesView from './SettingsServicesView.vue';

type PermissionOps = Record<string, boolean>;

const permissionFixture = {
  isAdminUser: false,
  calls: [] as string[],
  handler: async (_resource: string): Promise<PermissionOps> => ({ ViewBasic: true }),
};

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    get isAdminUser() {
      return permissionFixture.isAdminUser;
    },
    getResourcePermission: async (resource: string) => {
      permissionFixture.calls.push(resource);
      return permissionFixture.handler(resource);
    },
  }),
}));

/**
 * B-1 lesson: no real request may escape this suite. The view's data
 * reads are mocked (serviceApis, permission store), so any fetch call
 * is a leak; the stub fails loudly instead of reaching the network.
 * It stays in force for the whole suite (stubGlobal in beforeAll).
 */
const fetchStub = vi.fn(async (): Promise<never> => {
  throw new Error('unexpected fetch in SettingsServicesView suite');
});

beforeAll(() => {
  vi.stubGlobal('fetch', fetchStub);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** Settles the chained gate → list watcher updates after a deferred permission resolves. */
async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
  await nextTick();
}

function deferredOps(): {
  promise: Promise<PermissionOps>;
  resolve: (ops: PermissionOps) => void;
} {
  let resolve!: (ops: PermissionOps) => void;
  const promise = new Promise<PermissionOps>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const apiFixture = vi.hoisted(() => ({
  calls: [] as { kind: string; query: unknown }[],
  pages: {} as Record<string, CatalogService[]>,
  failKinds: new Set<string>(),
}));

vi.mock('@/ingestion/serviceApis', async (importOriginal) => {
  const original = (await importOriginal()) as typeof import('@/ingestion/serviceApis');
  const kinds: ServiceKind[] = [
    'database',
    'messaging',
    'dashboard',
    'storage',
    'pipeline',
    'api',
    'mlmodel',
    'metadata',
    'drive',
    'search',
    'llm',
    'mcp',
    'security',
  ];
  return {
    ...original,
    SERVICE_LIST_API: Object.fromEntries(
      kinds.map((kind) => [
        kind,
        async (query?: unknown) => {
          apiFixture.calls.push({ kind, query });
          if (apiFixture.failKinds.has(kind)) {
            throw new Error(`list failed: ${kind}`);
          }
          const data = apiFixture.pages[kind] ?? [];
          return { data, total: data.length, paging: {} };
        },
      ]),
    ),
  };
});

/** The stub surfaces the scope prop so the tab wiring assertions can read it. */
vi.mock('@/views/ingestion/PipelinesListView.vue', () => ({
  default: {
    props: ['kindFilter'],
    template: '<div data-testid="pipelines-list-stub" :data-kind-filter="kindFilter">pipelines</div>',
  },
}));

const stub = (label: string) => ({ template: `<div>${label}</div>` });

function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: stub('hub') },
      { path: '/settings/:category', name: 'settings-category', component: stub('category') },
      {
        path: '/settings/services/:tab',
        name: 'settings-services',
        component: SettingsServicesView,
      },
      {
        path: '/ingestion/services/:kind/:id',
        name: 'ingestion-service',
        component: stub('detail'),
      },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: stub('404') },
    ],
  });
}

async function mountServices(path: string, locale: SupportedLocale = 'en-US') {
  const router = testRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(SettingsServicesView, {
    global: { plugins: [router, Antd, createTestI18n(locale)] },
  });
  await flushPromises();
  return { wrapper, router };
}

/**
 * Navigation tests mount through a real RouterView: pushing away from
 * the page must unmount the view, otherwise the stale instance's
 * segment watcher would replace the new route with not-found.
 */
async function mountServicesApp(path: string) {
  const router = testRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [router, Antd, createTestI18n('en-US')] } },
  );
  await flushPromises();
  return { wrapper, router };
}

function serviceFixture(kind: ServiceKind, name: string): CatalogService {
  return {
    id: `${kind}-${name}`,
    name,
    fullyQualifiedName: name,
    kind,
    serviceType: `${name}Type`,
  };
}

beforeEach(() => {
  permissionFixture.isAdminUser = false;
  permissionFixture.calls = [];
  permissionFixture.handler = async () => ({ ViewBasic: true });
  fetchStub.mockClear();
  apiFixture.calls = [];
  apiFixture.pages = {
    database: [serviceFixture('database', 'mysql-prod'), serviceFixture('database', 'pg-dev')],
    api: [serviceFixture('api', 'rest-api')],
  };
  apiFixture.failKinds = new Set();
});

describe('SettingsServicesView (DESIGN §6.4)', () => {
  it.each(['bogus', 'llm', 'mcp', 'llmServices', 'mcpServices', ''])(
    'replaces an invalid tab segment %j with the not-found route (D-18/D-10)',
    async (segment) => {
      const { router } = await mountServices(`/settings/services/${segment}`);
      expect(router.currentRoute.value.name).toBe('not-found');
    },
  );

  it('loads the mapping-key kind and renders the services table', async () => {
    const { wrapper } = await mountServices('/settings/services/databases');
    expect(apiFixture.calls).toEqual([
      { kind: 'database', query: { limit: 100, include: 'non-deleted' } },
    ]);
    const rows = wrapper.findAll('.ant-table-tbody tr');
    expect(rows.map((row) => row.text())).toHaveLength(2);
    expect(wrapper.find('.ant-table-tbody').text()).toContain('mysql-prod');
    expect(wrapper.find('.ant-table-tbody').text()).toContain('pg-dev');
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(false);
  });

  it('resolves enum-value segments to the same kind', async () => {
    const { wrapper } = await mountServices('/settings/services/databaseServices');
    expect(apiFixture.calls).toEqual([
      { kind: 'database', query: { limit: 100, include: 'non-deleted' } },
    ]);
    expect(wrapper.find('.ant-table-tbody').text()).toContain('mysql-prod');
  });

  it('renders the breadcrumb as Settings > Services > capitalize(tab)', async () => {
    const { wrapper } = await mountServices('/settings/services/databases');
    const crumb = wrapper.find('[data-testid="sm-breadcrumb"]');
    expect(crumb.text()).toContain('Settings');
    expect(crumb.text()).toContain('Services');
    expect(crumb.text()).toContain('Databases');
    const links = crumb.findAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].text()).toBe('Settings');
    expect(links[1].text()).toBe('Services');
  });

  it('uses the lodash-capitalize form for camelCase segments (pin capitalize)', async () => {
    const { wrapper } = await mountServices('/settings/services/databaseServices');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').text()).toContain('Databaseservices');
  });

  it('links the Services crumb back to the services category page', async () => {
    const { wrapper, router } = await mountServicesApp('/settings/services/databases');
    const links = wrapper.find('[data-testid="sm-breadcrumb"]').findAll('a');
    await links[1].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-category');
    expect(router.currentRoute.value.params).toEqual({ category: 'services' });
  });

  it('renders the Data Observability label for the dataObservability tab', async () => {
    permissionFixture.isAdminUser = true;
    const { wrapper } = await mountServices('/settings/services/dataObservability');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').text()).toContain('Data Observability');
    expect(apiFixture.calls).toEqual([]);
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-services-table"]').exists()).toBe(false);
  });

  it('shows only the Pipelines tab for dataObservability', async () => {
    permissionFixture.isAdminUser = true;
    const { wrapper } = await mountServices('/settings/services/dataObservability');
    const tabs = wrapper.findAll('.ant-tabs-tab');
    expect(tabs.map((tab) => tab.text())).toEqual(['Pipelines']);
  });

  it('shows no tabs and no crash for a non-admin on dataObservability', async () => {
    const { wrapper } = await mountServices('/settings/services/dataObservability');
    expect(wrapper.find('[data-testid="settings-services-tabs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(true);
  });

  it('shows only the Services tab to a non-admin', async () => {
    const { wrapper } = await mountServices('/settings/services/databases');
    const tabs = wrapper.findAll('.ant-tabs-tab');
    expect(tabs.map((tab) => tab.text())).toEqual(['Services']);
  });

  it('falls back to the first rendered tab when the query tab is not rendered', async () => {
    const { wrapper } = await mountServices('/settings/services/databases?tab=pipelines');
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-services-table"]').exists()).toBe(true);
  });

  it('renders the pipelines content when the query tab is pipelines', async () => {
    permissionFixture.isAdminUser = true;
    const { wrapper } = await mountServices('/settings/services/databases?tab=pipelines');
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-services-table"]').exists()).toBe(false);
  });

  it('passes the resolved kind as the pipelines scope', async () => {
    permissionFixture.isAdminUser = true;
    const { wrapper } = await mountServices('/settings/services/databases?tab=pipelines');
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').attributes('data-kind-filter')).toBe('database');
  });

  it('passes testSuites as the pipelines scope for dataObservability', async () => {
    permissionFixture.isAdminUser = true;
    const { wrapper } = await mountServices('/settings/services/dataObservability');
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').attributes('data-kind-filter')).toBe('testSuites');
  });

  it('switches the inner tab through the query on tab click', async () => {
    permissionFixture.isAdminUser = true;
    const { wrapper, router } = await mountServices('/settings/services/databases');
    const tabs = wrapper.findAll('.ant-tabs-tab');
    await tabs[1].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ tab: 'pipelines' });
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(true);
  });

  it('does not consume ?health= (the aggregate list keeps that filter)', async () => {
    const { wrapper } = await mountServices('/settings/services/databases?health=unhealthy');
    expect(wrapper.findAll('.ant-table-tbody tr')).toHaveLength(2);
    expect(apiFixture.calls).toHaveLength(1);
  });

  it('navigates a row click to the service detail route', async () => {
    const { wrapper, router } = await mountServicesApp('/settings/services/databases');
    const rows = wrapper.findAll('.ant-table-tbody tr');
    await rows[0].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toEqual({ kind: 'database', id: 'database-mysql-prod' });
  });

  it('surfaces a fetch failure instead of crashing', async () => {
    apiFixture.failKinds = new Set(['database']);
    const { wrapper } = await mountServices('/settings/services/databases');
    expect(wrapper.find('.ant-alert-error').exists()).toBe(true);
    expect(wrapper.find('.ant-alert-error').text()).toContain('list failed: database');
    expect(wrapper.findAll('.ant-table-tbody tr')).toHaveLength(1);
    expect(wrapper.find('.ant-table-tbody').text()).toContain('No data');
  });
});

describe('SettingsServicesView view gate (DESIGN §6.4 页内视图门, GAP-HUB-1)', () => {
  it('denies a regular tab without view permission: bare placeholder, no breadcrumb, no tabs, no list request', async () => {
    permissionFixture.handler = async () => ({});
    const { wrapper } = await mountServices('/settings/services/databases');
    const placeholder = wrapper.find('[data-testid="permission-error-placeholder"]');
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.text()).toContain('View Database Services');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-services-tabs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-services-table"]').exists()).toBe(false);
    expect(apiFixture.calls).toEqual([]);
    expect(permissionFixture.calls).toEqual(['databaseService']);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('denies a regular tab without view permission in zh: bare placeholder, template wording with no extra space', async () => {
    permissionFixture.handler = async () => ({});
    const { wrapper } = await mountServices('/settings/services/databases', 'zh-CN');
    const placeholder = wrapper.find('[data-testid="permission-error-placeholder"]');
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.text()).toContain('查看Database Services');
    expect(placeholder.text()).not.toContain('查看 Database Services');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-services-tabs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-services-table"]').exists()).toBe(false);
    expect(apiFixture.calls).toEqual([]);
    expect(permissionFixture.calls).toEqual(['databaseService']);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('denies when ViewBasic and ViewAll are both explicitly false (Create alone never grants view)', async () => {
    permissionFixture.handler = async () => ({ ViewBasic: false, ViewAll: false, Create: true });
    const { wrapper } = await mountServices('/settings/services/databases');
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(apiFixture.calls).toEqual([]);
  });

  it('grants on ViewAll alone', async () => {
    permissionFixture.handler = async () => ({ ViewAll: true });
    const { wrapper } = await mountServices('/settings/services/databases');
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
    expect(wrapper.find('.ant-table-tbody').text()).toContain('mysql-prod');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('checks the mapped resource for the raw segment (dashboards, enum segment)', async () => {
    const first = await mountServices('/settings/services/dashboards');
    expect(permissionFixture.calls).toEqual(['dashboardService']);
    expect(first.wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
    first.wrapper.unmount();
    permissionFixture.calls = [];
    const second = await mountServices('/settings/services/databaseServices');
    expect(permissionFixture.calls).toEqual(['databaseService']);
    expect(second.wrapper.find('.ant-table-tbody').text()).toContain('mysql-prod');
  });

  it('denies the mlmodels tab when only mlmodelService is granted (pin fallback checks databaseService)', async () => {
    permissionFixture.handler = async (resource): Promise<PermissionOps> =>
      resource === 'mlmodelService' ? { ViewBasic: true } : {};
    const { wrapper } = await mountServices('/settings/services/mlmodels');
    expect(permissionFixture.calls).toEqual(['databaseService']);
    const placeholder = wrapper.find('[data-testid="permission-error-placeholder"]');
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.text()).toContain('View Mlmodel Services');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(apiFixture.calls).toEqual([]);
  });

  it('shows the placeholder while the permission is unloaded, then the list once granted', async () => {
    const deferred = deferredOps();
    permissionFixture.handler = () => deferred.promise;
    const { wrapper } = await mountServices('/settings/services/databases');
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-services-tabs"]').exists()).toBe(false);
    expect(apiFixture.calls).toEqual([]);
    deferred.resolve({ ViewBasic: true });
    await settle();
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(true);
    expect(wrapper.find('.ant-table-tbody').text()).toContain('mysql-prod');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('fails closed when the permission read rejects', async () => {
    permissionFixture.handler = async () => {
      throw new Error('permission read failed');
    };
    const { wrapper } = await mountServices('/settings/services/databases');
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-services-tabs"]').exists()).toBe(false);
    expect(apiFixture.calls).toEqual([]);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('grants dataObservability by checking databaseService (pin fallback)', async () => {
    permissionFixture.isAdminUser = true;
    const { wrapper } = await mountServices('/settings/services/dataObservability');
    expect(permissionFixture.calls).toEqual(['databaseService']);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').text()).toContain('Data Observability');
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(true);
    expect(apiFixture.calls).toEqual([]);
  });

  it('denies dataObservability with the bare placeholder and no breadcrumb or tabs', async () => {
    permissionFixture.handler = async () => ({});
    const { wrapper } = await mountServices('/settings/services/dataObservability');
    expect(permissionFixture.calls).toEqual(['databaseService']);
    const placeholder = wrapper.find('[data-testid="permission-error-placeholder"]');
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.text()).toContain('View Data Observability Services');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-services-tabs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(false);
    expect(apiFixture.calls).toEqual([]);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('shows the placeholder while the dataObservability permission is unloaded, then the pipelines tab once granted', async () => {
    permissionFixture.isAdminUser = true;
    const deferred = deferredOps();
    permissionFixture.handler = () => deferred.promise;
    const { wrapper } = await mountServices('/settings/services/dataObservability');
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(false);
    deferred.resolve({ ViewAll: true });
    await settle();
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').text()).toContain('Data Observability');
    expect(wrapper.find('[data-testid="pipelines-list-stub"]').exists()).toBe(true);
    expect(permissionFixture.calls).toEqual(['databaseService']);
  });
});
