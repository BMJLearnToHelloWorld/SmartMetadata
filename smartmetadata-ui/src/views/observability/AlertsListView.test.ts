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
import type { LimitConfig } from '@/api/limits';
import AlertDeleteModal from '@/components/notifications/AlertDeleteModal.vue';
import { createTestI18n } from '@/test/i18n';
import type { EventSubscription } from '@/types/quality';
import AlertsListView from './AlertsListView.vue';

const getAllAlerts = vi.fn();
const getAlertsFromName = vi.fn();
const deleteEventSubscription = vi.fn();
const getLimitByResource = vi.fn();
const getLimitConfig = vi.fn();
const getResourcePermission = vi.fn();
const getEntityPermissionByFqn = vi.fn();

vi.mock('@/api/eventSubscriptions', () => ({
  getAllAlerts: (...args: unknown[]) => getAllAlerts(...args),
  getAlertsFromName: (...args: unknown[]) => getAlertsFromName(...args),
  deleteEventSubscription: (...args: unknown[]) => deleteEventSubscription(...args),
}));

vi.mock('@/api/limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/limits')>();
  return {
    ...actual,
    getLimitByResource: (...args: unknown[]) => getLimitByResource(...args),
    getLimitConfig: (...args: unknown[]) => getLimitConfig(...args),
  };
});

// P1 gating line: the view reads permissions through the store, which
// calls this module. Helpers stay real; only the fetchers are stubbed.
vi.mock('@/api/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/permissions')>();
  return {
    ...actual,
    getResourcePermission: (...args: unknown[]) => getResourcePermission(...args),
    getEntityPermissionByFqn: (...args: unknown[]) => getEntityPermissionByFqn(...args),
  };
});

const stub = { template: '<div />' };

function alertFixture(overrides: Partial<EventSubscription> = {}): EventSubscription {
  return {
    id: 'a1',
    name: 'dq-alert',
    fullyQualifiedName: 'dq-alert',
    displayName: 'DQ Alert',
    description: 'Checks data.',
    alertType: 'Notification',
    provider: 'user',
    filteringRules: { resources: ['table'] },
    ...overrides,
  } as EventSubscription;
}

const systemAlert = alertFixture({
  id: 'sys-1',
  name: 'ActivityFeedAlert',
  fullyQualifiedName: 'ActivityFeedAlert',
  displayName: 'Activity Feed',
  provider: 'system',
});

function resourcePermission(operations: string[]) {
  return {
    resource: 'eventsubscription',
    permissions: operations.map((operation) => ({ operation, access: 'allow' })),
  };
}

const entityPermission = {
  resource: 'eventsubscription',
  permissions: [
    { operation: 'EditAll', access: 'allow' },
    { operation: 'Delete', access: 'allow' },
  ],
};

async function mountView(path: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: stub },
      {
        path: '/settings/notifications/add-notification',
        name: 'settings-add-notification',
        component: stub,
      },
      { path: '/observability/alerts', name: 'observability-alerts', component: AlertsListView },
      { path: '/observability/alerts/:id', name: 'observability-alert', component: { template: '<div />' } },
      { path: '/observability/alerts/add', name: 'observability-alerts-add', component: stub },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(AlertsListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await settle(wrapper);
  return { wrapper, router };
}

async function settle(wrapper: VueWrapper): Promise<void> {
  await flushPromises();
  await wrapper.vm.$nextTick();
  await flushPromises();
  await wrapper.vm.$nextTick();
}

/**
 * The delete modal renders through an antd portal; its mount (and
 * unmount) lands a frame after the triggering state change. Poll for
 * the portal node instead of assuming it is already in the DOM.
 */
async function waitForBodySelector(selector: string): Promise<Element> {
  for (let i = 0; i < 40; i++) {
    const el = document.body.querySelector(selector);
    if (el) {
      return el;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`selector never appeared: ${selector}`);
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let successSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getAllAlerts.mockResolvedValue({ data: [alertFixture()], after: undefined, before: undefined, total: 1 });
  getAlertsFromName.mockResolvedValue(systemAlert);
  deleteEventSubscription.mockResolvedValue({});
  getLimitByResource.mockResolvedValue({});
  getLimitConfig.mockResolvedValue({ enable: false } as LimitConfig);
  getResourcePermission.mockResolvedValue(resourcePermission(['Create']));
  getEntityPermissionByFqn.mockResolvedValue(entityPermission);
  errorSpy = vi.spyOn(message, 'error');
  successSpy = vi.spyOn(message, 'success');
});

afterEach(() => {
  errorSpy.mockRestore();
  successSpy.mockRestore();
  document.body.innerHTML = '';
});

describe('observability face (C chain)', () => {
  it('renders rows, filters provider-System rows, and never fetches the system alert', async () => {
    getAllAlerts.mockResolvedValue({
      data: [alertFixture(), systemAlert],
      after: undefined,
      before: undefined,
      total: 2,
    });
    const { wrapper } = await mountView('/observability/alerts');
    const names = wrapper.findAll('[data-testid="alert-name"]');
    expect(names).toHaveLength(1);
    expect(names[0].text()).toBe('DQ Alert');
    expect(wrapper.text()).toContain('table');
    expect(wrapper.text()).toContain('Checks data.');
    expect(getAlertsFromName).not.toHaveBeenCalled();
    expect(getEntityPermissionByFqn).toHaveBeenCalledTimes(1);
    expect(getEntityPermissionByFqn).toHaveBeenCalledWith('eventsubscription', 'dq-alert');
    expect(getAllAlerts).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'Observability', limit: 15 }),
    );
  });

  it('shows the empty state with the create CTA when Create is allowed', async () => {
    getAllAlerts.mockResolvedValue({ data: [], after: undefined, before: undefined, total: 0 });
    const { wrapper } = await mountView('/observability/alerts');
    expect(wrapper.find('[data-testid="alert-table"]').exists()).toBe(false);
    expect(wrapper.find('.empty-placeholder__actions button').exists()).toBe(true);
  });

  it('hides the empty-state CTA without Create or All', async () => {
    getAllAlerts.mockResolvedValue({ data: [], after: undefined, before: undefined, total: 0 });
    getResourcePermission.mockResolvedValue(resourcePermission([]));
    const { wrapper } = await mountView('/observability/alerts');
    expect(wrapper.find('.empty-placeholder__actions').exists()).toBe(false);
  });

  it('shows the error placeholder with retry and no toast on list failure', async () => {
    getAllAlerts.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { wrapper } = await mountView('/observability/alerts');
    expect(wrapper.find('.empty-placeholder__actions button').exists()).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    getAllAlerts.mockResolvedValue({ data: [alertFixture()], after: undefined, before: undefined, total: 1 });
    await wrapper.find('.empty-placeholder__actions button').trigger('click');
    await settle(wrapper);
    expect(wrapper.findAll('[data-testid="alert-name"]')).toHaveLength(1);
  });

  it('retries the resource permission when only the permission fetch failed', async () => {
    // Pin shows the error placeholder only when the list is empty
    // (ObservabilityAlertsTable empty gate); with rows present the
    // permission failure surfaces as a toast only.
    getAllAlerts.mockResolvedValue({ data: [], after: undefined, before: undefined, total: 0 });
    getResourcePermission
      .mockRejectedValueOnce(new ApiError(500, 'boom'))
      .mockResolvedValue(resourcePermission(['Create']));
    const { wrapper, router } = await mountView('/observability/alerts');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.empty-placeholder__actions button').exists()).toBe(true);
    await wrapper.find('.empty-placeholder__actions button').trigger('click');
    await settle(wrapper);
    expect(getResourcePermission).toHaveBeenCalledTimes(2);
    // The retry landed in the empty state with a working create CTA.
    await wrapper.find('.empty-placeholder__actions button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/observability/alerts/add');
  });

  // Multi-step modal flow: single-run timing on this VM is ~5.6s
  // (portal mount + three settles), above the default 5s timeout.
  it('deletes from the same page: limit refresh, then a same-cursor refetch', async () => {
    getAllAlerts.mockImplementation(async (params: { after?: string }) => {
      if (params.after === 'c2') {
        return { data: [alertFixture({ id: 'a2', name: 'second', fullyQualifiedName: 'second' })], after: undefined, before: 'c1', total: 30 };
      }
      return { data: [alertFixture()], after: 'c2', before: undefined, total: 30 };
    });
    const { wrapper } = await mountView('/observability/alerts');
    await wrapper.get('[data-testid="next"]').trigger('click');
    await settle(wrapper);
    expect(getAllAlerts).toHaveBeenLastCalledWith(expect.objectContaining({ after: 'c2' }));
    await wrapper.get('[data-testid="alert-delete-second"]').trigger('click');
    await waitForBodySelector('[data-testid="delete-modal"]');
    const confirm = (await waitForBodySelector('[data-testid="confirm-button"]')) as HTMLElement;
    confirm.click();
    await settle(wrapper);
    expect(deleteEventSubscription).toHaveBeenCalledWith('a2');
    expect(getLimitByResource).toHaveBeenCalledWith('eventsubscription');
    expect(getAllAlerts).toHaveBeenLastCalledWith(expect.objectContaining({ after: 'c2' }));
    // The close is the controlled `open` prop flipping off; the
    // portal node itself lingers until antd's leave transition ends,
    // which jsdom never fires.
    expect(wrapper.findComponent(AlertDeleteModal).props('open')).toBe(false);
    expect(successSpy).toHaveBeenCalledTimes(1);
  }, 10000);

  it('sends no delete when the delete modal is cancelled', async () => {
    const { wrapper } = await mountView('/observability/alerts');
    await wrapper.get('[data-testid="alert-delete-dq-alert"]').trigger('click');
    await waitForBodySelector('[data-testid="delete-modal"]');
    const cancel = (await waitForBodySelector('[data-testid="cancel-button"]')) as HTMLElement;
    cancel.click();
    await settle(wrapper);
    expect(deleteEventSubscription).not.toHaveBeenCalled();
    expect(getAllAlerts).toHaveBeenCalledTimes(1);
    expect(wrapper.findComponent(AlertDeleteModal).props('open')).toBe(false);
  }, 10000);

  it('toasts and skips the reload when the limit refresh fails after a delete', async () => {
    const { wrapper } = await mountView('/observability/alerts');
    // The limit refresh runs only from handleAlertDelete, so the
    // rejection lands on the delete flow, not on the mount.
    getLimitByResource.mockRejectedValueOnce(new ApiError(500, 'boom'));
    await wrapper.get('[data-testid="alert-delete-dq-alert"]').trigger('click');
    await waitForBodySelector('[data-testid="delete-modal"]');
    const confirm = (await waitForBodySelector('[data-testid="confirm-button"]')) as HTMLElement;
    confirm.click();
    await settle(wrapper);
    expect(deleteEventSubscription).toHaveBeenCalledWith('a1');
    expect(getLimitByResource).toHaveBeenCalledTimes(1);
    // The delete itself succeeded and toasted; the limit failure toasted
    // and skipped the refetch.
    expect(successSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(getAllAlerts).toHaveBeenCalledTimes(1);
    expect(wrapper.findComponent(AlertDeleteModal).props('open')).toBe(false);
  }, 10000);

  it('toasts the delete failure without refreshing the limit or reloading, and shows the permanent-delete wording', async () => {
    // The rejection targets the delete path (no list fetch runs between
    // mount and confirm).
    deleteEventSubscription.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { wrapper } = await mountView('/observability/alerts');
    await wrapper.get('[data-testid="alert-delete-dq-alert"]').trigger('click');
    await waitForBodySelector('[data-testid="delete-modal"]');
    expect(document.body.querySelector('.alert-delete-modal__message')?.textContent).toBe(
      "Delete this dq alert and all its metadata forever. This can't be undone.",
    );
    const confirm = (await waitForBodySelector('[data-testid="confirm-button"]')) as HTMLElement;
    confirm.click();
    await settle(wrapper);
    expect(deleteEventSubscription).toHaveBeenCalledWith('a1');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(successSpy).not.toHaveBeenCalled();
    expect(getLimitByResource).not.toHaveBeenCalled();
    expect(getAllAlerts).toHaveBeenCalledTimes(1);
    expect(wrapper.findComponent(AlertDeleteModal).props('open')).toBe(false);
  }, 10000);

  it('navigates to the observability add path from the header CTA', async () => {
    const { wrapper, router } = await mountView('/observability/alerts');
    await wrapper.get('[data-testid="create-observability"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/observability/alerts/add');
  });

  it('links the Edit button to the observability edit path', async () => {
    const { wrapper } = await mountView('/observability/alerts');
    const edit = wrapper.get('[data-testid="alert-edit-dq-alert"]');
    expect(edit.element.closest('a')?.getAttribute('href')).toBe(
      '/observability/alerts/edit/dq-alert',
    );
  });
});

describe('settings face (A chain)', () => {
  it('fetches serially and prepends the system alert; row permissions exclude it', async () => {
    const calls: string[] = [];
    getAllAlerts.mockImplementation(async () => {
      calls.push('list');
      return { data: [alertFixture()], after: undefined, before: undefined, total: 1 };
    });
    getAlertsFromName.mockImplementation(async () => {
      calls.push('system');
      return systemAlert;
    });
    const { wrapper } = await mountView('/settings/notifications/alerts');
    expect(calls).toEqual(['list', 'system']);
    const names = wrapper.findAll('[data-testid="alert-name"]');
    expect(names.map((name) => name.text())).toEqual(['Activity Feed', 'DQ Alert']);
    expect(getEntityPermissionByFqn).toHaveBeenCalledTimes(1);
    expect(getEntityPermissionByFqn).toHaveBeenCalledWith('eventsubscription', 'dq-alert');
    expect(getAllAlerts).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'Notification', limit: 15 }),
    );
  });

  it('does not fetch the system alert when paging with an after cursor', async () => {
    getAllAlerts.mockImplementation(async (params: { after?: string }) => {
      if (params.after === 'c2') {
        return { data: [alertFixture({ id: 'a2', name: 'second', fullyQualifiedName: 'second' })], after: undefined, before: 'c1', total: 30 };
      }
      return { data: [alertFixture()], after: 'c2', before: undefined, total: 30 };
    });
    const { wrapper } = await mountView('/settings/notifications/alerts');
    expect(getAlertsFromName).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-testid="next"]').trigger('click');
    await settle(wrapper);
    expect(getAlertsFromName).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('[data-testid="alert-name"]').map((n) => n.text())).toEqual(['DQ Alert']);
  });

  it('fails the whole page with one toast when the system fetch fails', async () => {
    getAlertsFromName.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { wrapper } = await mountView('/settings/notifications/alerts');
    expect(wrapper.findAll('[data-testid="alert-name"]')).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.empty-placeholder__actions button').exists()).toBe(true);
    await wrapper.find('.empty-placeholder__actions button').trigger('click');
    await settle(wrapper);
    expect(wrapper.findAll('[data-testid="alert-name"]')).toHaveLength(2);
  });

  it('shows the permission placeholder on 403', async () => {
    getAllAlerts.mockRejectedValueOnce(new ApiError(403, ''));
    const { wrapper } = await mountView('/settings/notifications/alerts');
    expect(wrapper.find('.empty-placeholder__actions').exists()).toBe(false);
    expect(wrapper.find('.empty-placeholder__description').exists()).toBe(true);
  });

  it('shows the header CTA with All but hides the empty-state CTA without Create', async () => {
    getAllAlerts.mockResolvedValue({ data: [], after: undefined, before: undefined, total: 0 });
    getResourcePermission.mockResolvedValue(resourcePermission(['All']));
    const { wrapper } = await mountView('/settings/notifications/alerts');
    expect(wrapper.find('[data-testid="create-notification"]').exists()).toBe(true);
    expect(wrapper.find('.empty-placeholder__actions').exists()).toBe(false);
  });

  it('disables Edit and Delete on a System row with permissions; the prepended row shows --', async () => {
    // Pin fetches row permissions for the page data only, so the
    // prepended system row has no permission entry and renders the
    // '--' placeholder; a System row inside the page data gets
    // permission entries and both buttons render disabled.
    getAllAlerts.mockResolvedValue({
      data: [
        alertFixture({ id: 's1', name: 'sys-dq', fullyQualifiedName: 'sys-dq', provider: 'system' }),
        alertFixture(),
      ],
      after: undefined,
      before: undefined,
      total: 2,
    });
    const { wrapper } = await mountView('/settings/notifications/alerts');
    expect(wrapper.get('[data-testid="alert-edit-sys-dq"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="alert-delete-sys-dq"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="alert-edit-dq-alert"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="alert-edit-ActivityFeedAlert"]').exists()).toBe(false);
    const rows = wrapper.findAll('tbody tr');
    expect(rows[0].text()).toContain('--');
  });

  // Multi-step modal flow: same portal-timing note as the
  // observability delete test above.
  it('restarts at page 1 after a delete', async () => {
    getAllAlerts.mockImplementation(async (params: { after?: string }) => {
      if (params.after === 'c2') {
        return { data: [alertFixture({ id: 'a2', name: 'second', fullyQualifiedName: 'second' })], after: undefined, before: 'c1', total: 30 };
      }
      return { data: [alertFixture()], after: 'c2', before: undefined, total: 30 };
    });
    const { wrapper } = await mountView('/settings/notifications/alerts');
    await wrapper.get('[data-testid="next"]').trigger('click');
    await settle(wrapper);
    await wrapper.get('[data-testid="alert-delete-second"]').trigger('click');
    await waitForBodySelector('[data-testid="delete-modal"]');
    const confirm = (await waitForBodySelector('[data-testid="confirm-button"]')) as HTMLElement;
    confirm.click();
    await settle(wrapper);
    const lastCall = getAllAlerts.mock.calls[getAllAlerts.mock.calls.length - 1][0] as Record<
      string,
      unknown
    >;
    expect(lastCall.after).toBeUndefined();
    expect(lastCall.before).toBeUndefined();
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toContain('1');
  }, 10000);

  it('renders the settings breadcrumb trail', async () => {
    const { wrapper } = await mountView('/settings/notifications/alerts');
    const breadcrumb = wrapper.get('[data-testid="sm-breadcrumb"]');
    expect(breadcrumb.findAll('li')).toHaveLength(3);
    expect(breadcrumb.findAll('a')).toHaveLength(2);
  });

  it('navigates to the settings add path from the header CTA', async () => {
    const { wrapper, router } = await mountView('/settings/notifications/alerts');
    await wrapper.get('[data-testid="create-notification"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/settings/notifications/add-notification');
  });
});
