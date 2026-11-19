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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createTestI18n } from '@/test/i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import {
  configureApp,
  deployApp,
  getApplicationByName,
  patchApplication,
  restoreApp,
  triggerOnDemandApp,
  uninstallApp,
} from '@/api/apps';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import { importSchema } from '@/views/marketplace/appAssets';
import AppDetailView from './AppDetailView.vue';

vi.mock('@/api/apps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/apps')>();
  return {
    ...actual,
    getApplicationByName: vi.fn(),
    patchApplication: vi.fn(),
    configureApp: vi.fn(),
    uninstallApp: vi.fn(),
    restoreApp: vi.fn(),
    triggerOnDemandApp: vi.fn(),
    deployApp: vi.fn(),
  };
});
vi.mock('@/views/marketplace/appAssets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/views/marketplace/appAssets')>();
  return { ...actual, importSchema: vi.fn() };
});
const { mockedRefreshLimit } = vi.hoisted(() => ({
  mockedRefreshLimit: vi.fn(async () => {}),
}));
vi.mock('@/stores/shellConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/shellConfig')>();
  return {
    ...actual,
    useShellConfigStore: () => ({ limit: undefined, refreshLimitConfig: mockedRefreshLimit }),
  };
});

const mockedByName = vi.mocked(getApplicationByName);
const mockedPatch = vi.mocked(patchApplication);
const mockedConfigure = vi.mocked(configureApp);
const mockedUninstall = vi.mocked(uninstallApp);
const mockedRestore = vi.mocked(restoreApp);
const mockedTrigger = vi.mocked(triggerOnDemandApp);
const mockedDeploy = vi.mocked(deployApp);
const mockedImportSchema = vi.mocked(importSchema);

const MESSAGES = {
  en: {
    label: {
      'application-plural': 'Applications',
      'browse-app-plural': 'Browse Apps',
      'manage-entity': 'Manage {entity}',
      application: 'Application',
      installed: 'Installed',
      'developed-by-developer': 'Developed by {developer}',
      'visit-developer-website': 'Visit developer website',
      disabled: 'Disabled',
      schedule: 'Schedule',
      configuration: 'Configuration',
      'recent-run-plural': 'Recent Runs',
      'live-indexing': 'Live Indexing',
      restore: 'Restore',
      disable: 'Disable',
      uninstall: 'Uninstall',
      cancel: 'Cancel',
      ok: 'OK',
      'enable-lowercase': 'enable',
      'disable-lowercase': 'disable',
      'uninstall-lowercase': 'uninstall',
    },
    message: {
      'cache-service-not-configured-message': 'Cache service not configured',
      'app-no-settings-to-manage': '{app} has no settings to manage',
      'restore-action-description': 'Restore {entityType}',
      'disable-app': 'Disable {app}',
      'uninstall-app': 'Uninstall {app}',
      'are-you-sure-action-property': 'Are you sure you want to {action} {propertyName}?',
      'are-you-sure': 'Are you sure?',
      'entity-enabled-success': '{entity} enabled successfully',
      'app-disabled-successfully': 'App disabled successfully',
      'app-uninstalled-successfully': 'App uninstalled successfully',
      'entity-saved-successfully': '{entity} saved successfully',
      'application-action-successfully': 'Application {action} successfully',
      'triggered-lowercase': 'triggered',
      deploy: 'deploy',
    },
    server: {
      'no-application-schema-found': 'No schema found for {appName}',
    },
  },
};

const DUMMY = { template: '<div />' };
const SCHEMA = { type: 'object', properties: {} };

const BASE_APP = {
  id: 'app-1',
  name: 'SearchIndexingApplication',
  fullyQualifiedName: 'SearchIndexingApplication',
  displayName: 'Search Indexing',
  description: 'Indexes entities',
  enabled: true,
  deleted: false,
  system: false,
  developer: 'Collate',
  developerUrl: 'https://example.com/dev',
  updatedAt: Date.now() - 3600_000,
  scheduleType: 'Scheduled',
  allowConfiguration: true,
  appConfiguration: { x: 1 },
  pipelines: [],
};

async function mountView(appOverrides: Record<string, unknown> = {}, schemaError = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { name: 'admin', isAdmin: true } as LoginUser;
  mockedByName.mockResolvedValue({ ...BASE_APP, ...appOverrides });
  if (schemaError) {
    mockedImportSchema.mockRejectedValue(new Error('no schema'));
  } else {
    mockedImportSchema.mockResolvedValue(SCHEMA);
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/apps', name: 'admin-apps', component: DUMMY },
      { path: '/admin/apps/:fqn', name: 'admin-app', component: DUMMY },
    ],
  });
  await router.push('/admin/apps/SearchIndexingApplication');
  await router.isReady();
  const wrapper = mount(AppDetailView, {
    props: { id: 'SearchIndexingApplication' },
    global: {
      plugins: [Antd, pinia, router, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
      stubs: {
        AppLogo: { template: '<div class="logo-stub" />' },
        NoDataPlaceholder: {
          props: { description: String, testId: String },
          template:
            '<div class="no-data-stub" :data-testid="testId" :data-description="description" />',
        },
        AppManageMenu: {
          props: { items: Array, label: String },
          template:
            '<div class="manage-stub"><button v-for="item in items" :key="item.key" :data-testid="item.id" @click="item.onClick">{{ item.name }}</button></div>',
        },
        AppConfirmationModal: {
          props: { visible: Boolean, bodyText: String },
          emits: ['cancel', 'confirm'],
          template:
            '<div v-if="visible" class="confirm-stub" :data-body="bodyText"><button data-testid="modal-cancel" @click="$emit(\'cancel\')">Cancel</button><button data-testid="modal-confirm" @click="$emit(\'confirm\')">OK</button></div>',
        },
        AppSchedule: {
          name: 'AppScheduleStub',
          props: ['appData', 'disabled', 'disabledReason', 'jsonSchema', 'loading', 'onSave', 'onDemandTrigger', 'onDeployTrigger'],
          template: '<div class="schedule-stub" />',
        },
        ApplicationConfiguration: {
          name: 'ApplicationConfigurationStub',
          props: ['appData', 'isLoading', 'jsonSchema', 'onConfigSave'],
          template: '<div class="config-stub" />',
        },
        McpApplicationConfiguration: {
          name: 'McpApplicationConfigurationStub',
          props: ['appName', 'jsonSchema'],
          template: '<div class="mcp-stub" />',
        },
        AppRunsHistory: { template: '<div class="runs-stub" />' },
        AppLiveIndexing: { template: '<div class="live-stub" />' },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppDetailView', () => {
  it('fetches by FQN with owners+pipelines and renders all four tabs', async () => {
    const { wrapper } = await mountView();
    expect(mockedByName).toHaveBeenCalledWith(
      'SearchIndexingApplication',
      { fields: ['owners', 'pipelines'], include: 'all' },
    );
    expect(mockedImportSchema).toHaveBeenCalledWith('SearchIndexingApplication');
    expect(wrapper.find('h4').text()).toBe('Search Indexing');
    expect(wrapper.text()).toContain('Developed by Collate');
    expect(wrapper.find('[data-testid="schedule"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="configuration"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="recent-runs"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="live-indexing"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders the no-tabs placeholder for an app with nothing to manage', async () => {
    const { wrapper } = await mountView({
      name: 'AIChatApplication',
      fullyQualifiedName: 'AIChatApplication',
      scheduleType: 'NoSchedule',
      allowConfiguration: false,
      appConfiguration: undefined,
    });
    expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(false);
    expect(wrapper.find('.no-data-stub').attributes('data-description')).toBe(
      'Search Indexing has no settings to manage',
    );
    wrapper.unmount();
  });

  it('keeps app data on schema failure and reports the schema message', async () => {
    const { wrapper } = await mountView(
      {
        name: 'AIChatApplication',
        fullyQualifiedName: 'AIChatApplication',
        scheduleType: 'NoSchedule',
        allowConfiguration: false,
        appConfiguration: undefined,
      },
      true,
    );
    expect(wrapper.find('h4').text()).toBe('Search Indexing');
    expect(wrapper.find('.no-data-stub').attributes('data-description')).toBe(
      'No schema found for SearchIndexingApplication',
    );
    wrapper.unmount();
  });

  it('shows the runtime-disabled badge with the cache reason', async () => {
    const { wrapper } = await mountView({
      name: 'CacheWarmupApplication',
      fullyQualifiedName: 'CacheWarmupApplication',
      enabled: false,
    });
    expect(wrapper.find('[data-testid="runtime-disabled-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="configuration"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="recent-runs"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('disables via uninstall with hardDelete=false, refreshes limits, navigates away', async () => {
    mockedUninstall.mockResolvedValue(undefined);
    mockedRefreshLimit.mockResolvedValue(undefined);
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="disable-button"]').trigger('click');
    expect(wrapper.find('.confirm-stub').attributes('data-body')).toBe(
      'Are you sure you want to disable Search Indexing?',
    );
    await wrapper.find('[data-testid="modal-confirm"]').trigger('click');
    await flushPromises();
    expect(mockedUninstall).toHaveBeenCalledWith('SearchIndexingApplication', false);
    expect(mockedRefreshLimit).toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('admin-apps');
    wrapper.unmount();
  });

  it('uninstalls a non-system app with hardDelete=true', async () => {
    mockedUninstall.mockResolvedValue(undefined);
    mockedRefreshLimit.mockResolvedValue(undefined);
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="uninstall-button"]').trigger('click');
    await wrapper.find('[data-testid="modal-confirm"]').trigger('click');
    await flushPromises();
    expect(mockedUninstall).toHaveBeenCalledWith('SearchIndexingApplication', true);
    wrapper.unmount();
  });

  it('restores a deleted app and navigates away even when restore fails', async () => {
    mockedRestore.mockRejectedValue(new Error('restore failed'));
    const { wrapper, router } = await mountView({ deleted: true });
    expect(wrapper.find('[data-testid="restore-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="disable-button"]').exists()).toBe(false);
    await wrapper.find('[data-testid="restore-button"]').trigger('click');
    await wrapper.find('[data-testid="modal-confirm"]').trigger('click');
    await flushPromises();
    expect(mockedRestore).toHaveBeenCalledWith('app-1');
    expect(router.currentRoute.value.name).toBe('admin-apps');
    wrapper.unmount();
  });

  it('saves configuration via JSON Patch plus the configure endpoint', async () => {
    mockedPatch.mockResolvedValue({ ...BASE_APP, appConfiguration: { a: 1 } });
    mockedConfigure.mockResolvedValue(undefined);
    const { wrapper } = await mountView();
    // antd Tabs mounts inactive panes lazily; activate the tab first.
    await wrapper.find('[data-testid="configuration"]').trigger('click');
    await flushPromises();
    const configStub = wrapper.findComponent({ name: 'ApplicationConfigurationStub' });
    await configStub.props('onConfigSave')({ a: 1 });
    await flushPromises();
    expect(mockedPatch).toHaveBeenCalledWith('app-1', expect.any(Array));
    expect(mockedConfigure).toHaveBeenCalledWith('SearchIndexingApplication', { a: 1 });
    wrapper.unmount();
  });

  it('saves a schedule as a Custom timeline patch', async () => {
    mockedPatch.mockResolvedValue({ ...BASE_APP });
    const { wrapper } = await mountView();
    const scheduleStub = wrapper.findComponent({ name: 'AppScheduleStub' });
    await scheduleStub.props('onSave')('0 0 * * *');
    await flushPromises();
    const patch = mockedPatch.mock.calls[0][1] as unknown as Array<Record<string, unknown>>;
    const scheduleOp = patch.find((op) => String(op.path).startsWith('/appSchedule'));
    expect(scheduleOp).toBeDefined();
    expect(scheduleOp?.value).toEqual({ scheduleTimeline: 'Custom', cronExpression: '0 0 * * *' });
    wrapper.unmount();
  });

  it('triggers on demand and deploys with a refetch', async () => {
    mockedTrigger.mockResolvedValue(undefined);
    mockedDeploy.mockResolvedValue(undefined);
    const { wrapper } = await mountView();
    const scheduleStub = wrapper.findComponent({ name: 'AppScheduleStub' });
    await scheduleStub.props('onDemandTrigger')();
    expect(mockedTrigger).toHaveBeenCalledWith('SearchIndexingApplication');
    const callsBefore = mockedByName.mock.calls.length;
    await scheduleStub.props('onDeployTrigger')();
    await flushPromises();
    expect(mockedDeploy).toHaveBeenCalledWith('SearchIndexingApplication');
    expect(mockedByName.mock.calls.length).toBeGreaterThan(callsBefore);
    wrapper.unmount();
  });

  it('renders the MCP tab for the MCP app as an admin', async () => {
    const { wrapper } = await mountView({
      name: 'McpApplication',
      fullyQualifiedName: 'McpApplication',
      appConfiguration: undefined,
      allowConfiguration: false,
    });
    expect(wrapper.find('[data-testid="configuration"]').exists()).toBe(true);
    await wrapper.find('[data-testid="configuration"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('.mcp-stub').exists()).toBe(true);
    wrapper.unmount();
  });
});

/**
 * Shell breadcrumb exception (row 2 / AP-C1), ported from the shell batch:
 * the detail page renders no breadcrumb and keeps the Browse Apps return
 * button back to the apps list. Adapted to the sections rewrite: the view
 * fetches by name through the mocked `getApplicationByName` (not the old
 * `getApp` fetch), so the stub sets the mocked response instead of a
 * global fetch handler; assertions are unchanged.
 */
describe('AppDetailView breadcrumb exception (row 2)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedByName.mockResolvedValue({
      id: 'a1',
      name: 'DataInsightsReportApp',
      displayName: 'Data Insights',
      appType: 'internal',
      fullyQualifiedName: 'DataInsightsReportApp',
    });
    mockedImportSchema.mockResolvedValue(SCHEMA);
  });

  async function mountApp() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settings/apps', name: 'admin-apps', component: { template: '<div>apps</div>' } },
        { path: '/settings/apps/:id', name: 'admin-app', component: AppDetailView, props: true },
      ],
    });
    await router.push('/settings/apps/a1');
    await router.isReady();
    const wrapper = mount(AppDetailView, {
      props: { id: 'a1' },
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
        stubs: {
          AppLogo: { template: '<div class="logo-stub" />' },
          NoDataPlaceholder: {
            props: { description: String, testId: String },
            template:
              '<div class="no-data-stub" :data-testid="testId" :data-description="description" />',
          },
          AppManageMenu: {
            props: { items: Array, label: String },
            template:
              '<div class="manage-stub"><button v-for="item in items" :key="item.key" :data-testid="item.id" @click="item.onClick">{{ item.name }}</button></div>',
          },
          AppConfirmationModal: {
            props: { visible: Boolean, bodyText: String },
            emits: ['cancel', 'confirm'],
            template:
              '<div v-if="visible" class="confirm-stub" :data-body="bodyText"><button data-testid="modal-cancel" @click="$emit(\'cancel\')">Cancel</button><button data-testid="modal-confirm" @click="$emit(\'confirm\')">OK</button></div>',
          },
          AppSchedule: {
            name: 'AppScheduleStub',
            props: ['appData', 'disabled', 'disabledReason', 'jsonSchema', 'loading', 'onSave', 'onDemandTrigger', 'onDeployTrigger'],
            template: '<div class="schedule-stub" />',
          },
          ApplicationConfiguration: {
            name: 'ApplicationConfigurationStub',
            props: ['appData', 'isLoading', 'jsonSchema', 'onConfigSave'],
            template: '<div class="config-stub" />',
          },
          McpApplicationConfiguration: {
            name: 'McpApplicationConfigurationStub',
            props: ['appName', 'jsonSchema'],
            template: '<div class="mcp-stub" />',
          },
          AppRunsHistory: { template: '<div class="runs-stub" />' },
          AppLiveIndexing: { template: '<div class="live-stub" />' },
        },
      },
    });
    await flushPromises();
    return { wrapper, router };
  }

  it('renders no breadcrumb and keeps the Browse Apps return button', async () => {
    const { wrapper } = await mountApp();
    expect(wrapper.find('[data-testid="entity-detail-breadcrumb"]').exists()).toBe(false);
    const button = wrapper.find('[data-testid="admin-app-browse-apps"]');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain('Browse Apps');
    expect(wrapper.find('[data-testid="admin-app-overview"]').exists()).toBe(true);
  });

  it('navigates the Browse Apps button back to the apps list', async () => {
    const { wrapper, router } = await mountApp();
    await wrapper.find('[data-testid="admin-app-browse-apps"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-apps');
  });
});
