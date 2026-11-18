/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { ApiError } from '@/api/client';
import AlertOwnersEditor from '@/components/notifications/AlertOwnersEditor.vue';
import { createTestI18n } from '@/test/i18n';
import type { AlertCapabilities } from '@/types/notifications';
import type { EventSubscription } from '@/types/quality';
import AlertDetailView from './AlertDetailView.vue';

const getObservabilityAlertByFQN = vi.fn();
const getAlertEventsDiagnosticsInfo = vi.fn();
const getAlertCapabilities = vi.fn();
const getAlertEventsFromId = vi.fn();
const getDiagnosticInfo = vi.fn();
const syncOffset = vi.fn();
const updateNotificationAlert = vi.fn();
const updateObservabilityAlert = vi.fn();
const deleteEventSubscription = vi.fn();
const getResourcePermission = vi.fn();
const getEntityPermissionByFqn = vi.fn();
const listUsers = vi.fn();
const searchUsers = vi.fn();
const listTeams = vi.fn();
const searchAssets = vi.fn();

vi.mock('@/api/eventSubscriptions', () => ({
  getObservabilityAlertByFQN: (...args: unknown[]) => getObservabilityAlertByFQN(...args),
  getAlertEventsDiagnosticsInfo: (...args: unknown[]) => getAlertEventsDiagnosticsInfo(...args),
  getAlertCapabilities: (...args: unknown[]) => getAlertCapabilities(...args),
  getAlertEventsFromId: (...args: unknown[]) => getAlertEventsFromId(...args),
  getDiagnosticInfo: (...args: unknown[]) => getDiagnosticInfo(...args),
  syncOffset: (...args: unknown[]) => syncOffset(...args),
  updateNotificationAlert: (...args: unknown[]) => updateNotificationAlert(...args),
  updateObservabilityAlert: (...args: unknown[]) => updateObservabilityAlert(...args),
  deleteEventSubscription: (...args: unknown[]) => deleteEventSubscription(...args),
}));

vi.mock('@/api/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/permissions')>();
  return {
    ...actual,
    getResourcePermission: (...args: unknown[]) => getResourcePermission(...args),
    getEntityPermissionByFqn: (...args: unknown[]) => getEntityPermissionByFqn(...args),
  };
});

vi.mock('@/api/users', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args),
  searchUsers: (...args: unknown[]) => searchUsers(...args),
}));

vi.mock('@/api/teams', () => ({
  listTeams: (...args: unknown[]) => listTeams(...args),
}));

vi.mock('@/api/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/search')>();
  return { ...actual, searchAssets: (...args: unknown[]) => searchAssets(...args) };
});

const stub = { template: '<div />' };

function alertFixture(overrides: Partial<EventSubscription> = {}): EventSubscription {
  return {
    id: 'a1',
    name: 'dq-alert',
    fullyQualifiedName: 'dq-alert',
    displayName: 'DQ Alert',
    description: 'Checks data.',
    alertType: 'Observability',
    provider: 'user',
    filteringRules: { resources: ['table'] },
    destinations: [
      {
        id: 'd1',
        type: 'Webhook',
        category: 'External',
        config: { endpoint: 'https://example.com/hook' },
        timeout: 10,
        readTimeout: 12,
      },
    ],
    owners: [{ id: 'u1', type: 'user', name: 'alice', displayName: 'Alice' }],
    ...overrides,
  } as EventSubscription;
}

const capabilitiesFixture: AlertCapabilities = {
  alertType: 'Observability',
  filters: [{ condition: { name: 'entityCreated' }, sources: ['table'] }],
  triggers: [{ condition: { name: 'notify' }, sources: ['table'] }],
  sources: [{ name: 'table', kind: 'entity', canJoin: true }],
  recipientCategories: ['Owners'],
};

const countsFixture = {
  totalEventsCount: 120,
  pendingEventsCount: 3,
  failedEventsCount: 1,
  countsAreLowerBound: true,
};

function entityPermission(operations: [string, string][]) {
  return {
    resource: 'eventsubscription',
    permissions: operations.map(([operation, access]) => ({ operation, access })),
  };
}

const fullPermission = entityPermission([
  ['ViewAll', 'allow'],
  ['EditAll', 'allow'],
  ['EditOwners', 'allow'],
  ['EditDescription', 'allow'],
  ['Delete', 'allow'],
]);

async function mountView(path: string): Promise<{
  wrapper: VueWrapper;
  router: Router;
  i18n: ReturnType<typeof createTestI18n>;
}> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createTestI18n();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: stub },
      { path: '/settings/notifications', name: 'settings-notifications', component: stub },
      {
        path: '/settings/notifications/alerts',
        name: 'settings-notification-alerts',
        component: stub,
      },
      {
        path: '/settings/notifications/alerts/:fqn/:tab',
        name: 'settings-notification-alert',
        component: AlertDetailView,
      },
      {
        path: '/settings/notifications/edit-notification/:fqn',
        name: 'settings-edit-notification',
        component: stub,
      },
      { path: '/observability/alerts', name: 'observability-alerts', component: stub },
      {
        path: '/observability/alert/:fqn/:tab',
        name: 'observability-alert',
        component: AlertDetailView,
      },
      { path: '/observability/alerts/edit/:fqn', name: 'observability-alert-edit', component: stub },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(AlertDetailView, {
    global: { plugins: [pinia, router, Antd, i18n] },
  });
  await settle(wrapper);
  return { wrapper, router, i18n };
}

async function settle(wrapper: VueWrapper): Promise<void> {
  await flushPromises();
  await wrapper.vm.$nextTick();
  await flushPromises();
  await wrapper.vm.$nextTick();
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let successSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getObservabilityAlertByFQN.mockResolvedValue(alertFixture());
  getAlertEventsDiagnosticsInfo.mockResolvedValue(countsFixture);
  getAlertCapabilities.mockResolvedValue(capabilitiesFixture);
  getAlertEventsFromId.mockResolvedValue({ data: [], total: 0 });
  getDiagnosticInfo.mockResolvedValue({});
  syncOffset.mockResolvedValue(undefined);
  updateNotificationAlert.mockImplementation(async (_id: string, _ops: unknown) => alertFixture());
  updateObservabilityAlert.mockImplementation(async (_id: string, _ops: unknown) => alertFixture());
  deleteEventSubscription.mockResolvedValue({});
  getResourcePermission.mockResolvedValue({ resource: 'user', permissions: [] });
  getEntityPermissionByFqn.mockResolvedValue(fullPermission);
  listUsers.mockResolvedValue({ data: [] });
  searchUsers.mockResolvedValue({ data: [] });
  listTeams.mockResolvedValue({ data: [] });
  searchAssets.mockResolvedValue({ total: 0, hits: [], facets: [] });
  errorSpy = vi.spyOn(message, 'error');
  successSpy = vi.spyOn(message, 'success');
});

afterEach(() => {
  errorSpy.mockRestore();
  successSpy.mockRestore();
  document.body.innerHTML = '';
});

describe('AlertDetailView content', () => {
  // Cold first mount of the detail tree (CodeMirror + Tiptap + antd):
  // single-run timing on this VM is ~4.1s, marginal against the 5s
  // default under load.
  it('renders the shell with title, breadcrumbs, counts, and three tabs', async () => {
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(getObservabilityAlertByFQN).toHaveBeenCalledWith('dq-alert', { fields: 'owners' });
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('DQ Alert');
    const breadcrumb = wrapper.get('[data-testid="entity-detail-breadcrumb"]');
    expect(breadcrumb.findAll('li')).toHaveLength(3);
    expect(breadcrumb.findAll('a')).toHaveLength(1);
    expect(wrapper.get('[data-testid="total-events-count"]').text()).toContain('120+');
    expect(wrapper.get('[data-testid="pending-events-count"]').text()).toContain('3+');
    expect(wrapper.get('[data-testid="failed-events-count"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="sync-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="alert-description"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Checks data.');
  }, 10000);

  it('renders the settings breadcrumb trail and face paths on the settings face', async () => {
    const { wrapper, router } = await mountView(
      '/settings/notifications/alerts/dq-alert/configuration',
    );
    const breadcrumb = wrapper.get('[data-testid="entity-detail-breadcrumb"]');
    expect(breadcrumb.findAll('li')).toHaveLength(4);
    expect(breadcrumb.findAll('a')).toHaveLength(3);
    await wrapper.get('[data-testid="edit-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe(
      '/settings/notifications/edit-notification/dq-alert',
    );
  });

  it('shows the permission placeholder with no breadcrumb when view is denied', async () => {
    getEntityPermissionByFqn.mockResolvedValue(entityPermission([]));
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-detail-breadcrumb"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(false);
    expect(getObservabilityAlertByFQN).not.toHaveBeenCalled();
  });

  it('shows the not-found placeholder with the breadcrumb on 404', async () => {
    getObservabilityAlertByFQN.mockRejectedValueOnce(new ApiError(404, ''));
    const { wrapper, i18n } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(true);
    expect(wrapper.find('.empty-placeholder__actions').exists()).toBe(false);
    expect(wrapper.text()).toContain(i18n.global.t('label.alert-not-found'));
  });

  it('shows the permission placeholder on 403', async () => {
    getObservabilityAlertByFQN.mockRejectedValueOnce(new ApiError(403, ''));
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(true);
    expect(wrapper.find('.empty-placeholder__actions').exists()).toBe(false);
  });

  it('shows the reload placeholder and refetches on generic failure', async () => {
    getObservabilityAlertByFQN.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('.empty-placeholder__actions button').exists()).toBe(true);
    await wrapper.find('.empty-placeholder__actions button').trigger('click');
    await settle(wrapper);
    expect(getObservabilityAlertByFQN).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
  });

  it('keeps counts silent on failure and renders zeros', async () => {
    getAlertEventsDiagnosticsInfo.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="total-events-count"]').text()).toContain('0');
    expect(wrapper.get('[data-testid="failed-events-count"]').text()).toContain('0');
  });

  it('syncs the offset with a success toast', async () => {
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    await wrapper.get('[data-testid="sync-button"]').trigger('click');
    await settle(wrapper);
    expect(syncOffset).toHaveBeenCalledWith('dq-alert');
    expect(successSpy).toHaveBeenCalledTimes(1);
  });

  it('hides Edit and Delete for provider-System alerts', async () => {
    getObservabilityAlertByFQN.mockResolvedValue(alertFixture({ provider: 'system' }));
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="delete-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sync-button"]').exists()).toBe(true);
  });

  it('hides Edit and Delete without the permissions', async () => {
    getEntityPermissionByFqn.mockResolvedValue(entityPermission([['ViewAll', 'allow']]));
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="delete-button"]').exists()).toBe(false);
  });

  it('deletes through the modal and navigates back to the face list', async () => {
    const { wrapper, router } = await mountView('/observability/alert/dq-alert/configuration');
    await wrapper.get('[data-testid="delete-button"]').trigger('click');
    await settle(wrapper);
    const confirm = document.body.querySelector('[data-testid="confirm-button"]') as HTMLElement;
    expect(confirm).not.toBeNull();
    confirm.click();
    await settle(wrapper);
    await flushPromises();
    expect(deleteEventSubscription).toHaveBeenCalledWith('a1');
    expect(router.currentRoute.value.path).toBe('/observability/alerts');
  }, 10000);

  it('hides the owners row when there are no owners and no edit permission', async () => {
    getObservabilityAlertByFQN.mockResolvedValue(alertFixture({ owners: [] }));
    getEntityPermissionByFqn.mockResolvedValue(
      entityPermission([
        ['ViewAll', 'allow'],
        ['EditAll', 'allow'],
        ['EditOwners', 'deny'],
        ['EditDescription', 'allow'],
        ['Delete', 'allow'],
      ]),
    );
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('[data-testid="alert-owners"]').exists()).toBe(false);
  });

  it('an explicit EditOwners deny beats EditAll: display shown, editor hidden', async () => {
    getEntityPermissionByFqn.mockResolvedValue(
      entityPermission([
        ['ViewAll', 'allow'],
        ['EditAll', 'allow'],
        ['EditOwners', 'deny'],
        ['EditDescription', 'allow'],
        ['Delete', 'allow'],
      ]),
    );
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('[data-testid="alert-owners"]').exists()).toBe(true);
    expect(wrapper.findComponent(AlertOwnersEditor).exists()).toBe(false);
    expect(wrapper.text()).toContain('Alice');
  });

  it('patches owners through the per-face update function', async () => {
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    const editor = wrapper.findComponent(AlertOwnersEditor);
    expect(editor.exists()).toBe(true);
    const nextOwners = [{ id: 'u2', type: 'user', name: 'bob', displayName: 'Bob' }];
    await editor.vm.$emit('update:modelValue', nextOwners);
    await settle(wrapper);
    expect(updateObservabilityAlert).toHaveBeenCalledWith(
      'a1',
      expect.arrayContaining([
        expect.objectContaining({ op: 'replace', path: '/owners', value: nextOwners }),
      ]),
    );
  });

  it('saves the description through the modal and closes it', async () => {
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    await wrapper.get('[data-testid="edit-description"]').trigger('click');
    await settle(wrapper);
    const modal = document.body.querySelector('.ant-modal');
    expect(modal).not.toBeNull();
    const okButton = Array.from(document.body.querySelectorAll('.ant-modal-footer button')).find(
      (button) => button.classList.contains('ant-btn-primary'),
    ) as HTMLElement;
    okButton.click();
    await settle(wrapper);
    expect(updateObservabilityAlert).toHaveBeenCalledWith('a1', expect.any(Array));
    expect(document.body.querySelector('.ant-modal')).toBeNull();
  }, 10000);

  it('hides the description edit button without EditDescription', async () => {
    getEntityPermissionByFqn.mockResolvedValue(
      entityPermission([
        ['ViewAll', 'allow'],
        ['EditAll', 'allow'],
        ['EditOwners', 'allow'],
        ['EditDescription', 'deny'],
        ['Delete', 'allow'],
      ]),
    );
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
  });
});

describe('AlertDetailView tabs', () => {
  it('renders the configuration segments in view mode', async () => {
    getObservabilityAlertByFQN.mockResolvedValue(
      alertFixture({
        input: {
          filters: [{ name: 'entityCreated', effect: 'include', arguments: [] }],
          actions: [{ name: 'notify', effect: 'include', arguments: [] }],
        },
      }),
    );
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(getAlertCapabilities).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="source-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filters-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="triggers-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="destination-list"]').exists()).toBe(true);
  });

  it('omits empty Filters and Actions sections', async () => {
    const { wrapper } = await mountView('/observability/alert/dq-alert/configuration');
    expect(wrapper.find('[data-testid="filters-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="triggers-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="destination-list"]').exists()).toBe(true);
  });

  it('switches tabs through the route and fetches recent events on visit', async () => {
    getAlertEventsFromId.mockResolvedValue({
      data: [
        {
          status: 'successful',
          timestamp: 1700000000000,
          data: [
            {
              id: 'evt-1',
              entityType: 'table',
              eventType: 'entityCreated',
              timestamp: 1700000000000,
            },
          ],
        },
      ],
      paging: { total: 1 },
    });
    const { wrapper, router } = await mountView('/observability/alert/dq-alert/configuration');
    expect(getAlertEventsFromId).not.toHaveBeenCalled();
    const tabItems = wrapper.findAll('.ant-tabs-tab');
    await tabItems[1].trigger('click');
    await settle(wrapper);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/observability/alert/dq-alert/recentEvents');
    expect(getAlertEventsFromId).toHaveBeenCalledWith({
      id: 'a1',
      params: { limit: 15, paginationOffset: 0 },
    });
    expect(wrapper.find('[data-testid="recent-events-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="event-collapse-evt-1"]').exists()).toBe(true);
    // Returning to the tab does not refetch: the visited tab stays mounted.
    await wrapper.findAll('.ant-tabs-tab')[0].trigger('click');
    await settle(wrapper);
    await wrapper.findAll('.ant-tabs-tab')[1].trigger('click');
    await settle(wrapper);
    expect(getAlertEventsFromId).toHaveBeenCalledTimes(1);
  }, 10000);

  it('falls back to configuration for an illegal tab', async () => {
    const { wrapper } = await mountView('/observability/alert/dq-alert/bogus');
    expect(wrapper.find('[data-testid="destination-list"]').exists()).toBe(true);
    expect(getAlertEventsFromId).not.toHaveBeenCalled();
    expect(getDiagnosticInfo).not.toHaveBeenCalled();
  });

  it('fetches diagnostic info on visit and renders the six items', async () => {
    getDiagnosticInfo.mockResolvedValue({
      latestOffset: 42,
      currentOffset: 40,
      startingOffset: 0,
      successfulEventsCount: 100,
      failedEventsCount: 2,
      hasProcessedAllEvents: false,
    });
    const { wrapper } = await mountView('/observability/alert/dq-alert/diagnostic-info');
    expect(getDiagnosticInfo).toHaveBeenCalledWith('dq-alert');
    expect(wrapper.text()).toContain('42');
  });

  it('toasts diagnostic failures without blocking the tab', async () => {
    getDiagnosticInfo.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { wrapper } = await mountView('/observability/alert/dq-alert/diagnostic-info');
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
  });
});
