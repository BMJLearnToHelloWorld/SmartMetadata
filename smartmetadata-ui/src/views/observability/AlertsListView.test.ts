/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { createTestI18n } from '@/test/i18n';
import AlertsListView from './AlertsListView.vue';

const listEventSubscriptions = vi.fn();
const createEventSubscription = vi.fn();
const deleteEventSubscription = vi.fn();
const confirmDelete = vi.fn();
const getLimitByResource = vi.fn();
const getResourcePermission = vi.fn();
const getEntityPermissionByFqn = vi.fn();

vi.mock('@/api/eventSubscriptions', () => ({
  listEventSubscriptions: (...args: unknown[]) => listEventSubscriptions(...args),
  createEventSubscription: (...args: unknown[]) => createEventSubscription(...args),
  deleteEventSubscription: (...args: unknown[]) => deleteEventSubscription(...args),
}));

vi.mock('@/features/crud/confirmDelete', () => ({
  confirmDelete: (...args: unknown[]) => confirmDelete(...args),
}));

vi.mock('@/api/limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/limits')>();
  return { ...actual, getLimitByResource: (...args: unknown[]) => getLimitByResource(...args) };
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

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/observability/alerts', name: 'observability-alerts', component: AlertsListView },
      { path: '/observability/alerts/:id', name: 'observability-alert', component: { template: '<div />' } },
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'observability-alerts' });
  await router.isReady();
  const wrapper = mount(AlertsListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('AlertsListView create form (Fix4)', () => {
  beforeEach(() => {
    listEventSubscriptions.mockReset();
    createEventSubscription.mockReset();
    deleteEventSubscription.mockReset();
    getResourcePermission.mockReset();
    getEntityPermissionByFqn.mockReset();
    listEventSubscriptions.mockResolvedValue({ data: [], total: 0, after: undefined });
    createEventSubscription.mockResolvedValue({ id: 'al1', name: 'dq-webhook' });
    getResourcePermission.mockResolvedValue({
      resource: 'eventsubscription',
      permissions: [{ operation: 'Create', access: 'allow' }],
    });
    getEntityPermissionByFqn.mockResolvedValue({
      resource: 'eventsubscription',
      permissions: [
        { operation: 'EditAll', access: 'allow' },
        { operation: 'Delete', access: 'allow' },
      ],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('offers destination type, read timeout, resources, and enabled in the create form', async () => {
    const wrapper = await mountView();
    await wrapper.get('[data-testid="create-alert"]').trigger('click');
    await flushPromises();
    // FormModal renders into document.body by default (Ant portal).
    expect(document.body.querySelector('[data-testid="create-alert-read-timeout"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="create-alert-resources"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="create-alert-enabled"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Destination type');
  });

  it('sends enabled and readTimeout with the default webhook destination', async () => {
    const wrapper = await mountView();
    await wrapper.get('[data-testid="create-alert"]').trigger('click');
    await flushPromises();
    const nameInput = document.body.querySelector('[data-testid="create-alert-name"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    nameInput?.focus();
    // Ant Input is controlled by Vue; set the DOM value and fire input so
    // v-model picks it up, mirroring the pattern other form tests use.
    if (nameInput) {
      nameInput.value = 'dq-webhook';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const webhookInput = document.body.querySelector(
      '[data-testid="create-alert-webhook"]',
    ) as HTMLInputElement | null;
    if (webhookInput) {
      webhookInput.value = 'https://example.com/hook';
      webhookInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();
    const okButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create'),
    );
    expect(okButton).toBeDefined();
    okButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(createEventSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'dq-webhook',
        enabled: true,
        destinations: [
          { category: 'External', type: 'Webhook', config: { endpoint: 'https://example.com/hook' }, readTimeout: 12 },
        ],
      }),
    );
  });

  it('disables create when the resource permission denies Create (P1)', async () => {
    getResourcePermission.mockResolvedValue({
      resource: 'eventsubscription',
      permissions: [{ operation: 'Create', access: 'deny' }],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="create-alert"]').attributes('disabled')).not.toBeUndefined();
  });
});

describe('AlertsListView delete', () => {
  const alert = {
    id: 'al1',
    name: 'dq-alert',
    displayName: 'DQ Alert',
    fullyQualifiedName: 'dq-alert',
    alertType: 'Observability',
    enabled: true,
    destinations: [],
    owners: [],
  };

  beforeEach(() => {
    listEventSubscriptions.mockReset();
    createEventSubscription.mockReset();
    deleteEventSubscription.mockReset();
    confirmDelete.mockReset();
    getLimitByResource.mockReset();
    getResourcePermission.mockReset();
    getEntityPermissionByFqn.mockReset();
    listEventSubscriptions.mockResolvedValue({ data: [alert], total: 1, after: 'cursor-2' });
    deleteEventSubscription.mockResolvedValue(undefined);
    confirmDelete.mockResolvedValue(true);
    getLimitByResource.mockResolvedValue({});
    getResourcePermission.mockResolvedValue({
      resource: 'eventsubscription',
      permissions: [{ operation: 'Create', access: 'allow' }],
    });
    getEntityPermissionByFqn.mockResolvedValue({
      resource: 'eventsubscription',
      permissions: [
        { operation: 'EditAll', access: 'allow' },
        { operation: 'Delete', access: 'allow' },
      ],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function triggerRowDelete(wrapper: Awaited<ReturnType<typeof mountView>>) {
    await wrapper.find('[data-testid="row-overflow-al1"]').trigger('click');
    await flushPromises();
    const item = document.body.querySelector('[data-testid="row-overflow-delete"]');
    expect(item).not.toBeNull();
    (item as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
  }

  it('deletes with the permanent-delete wording, refreshes the limit, then reloads the first page', async () => {
    const successSpy = vi.spyOn(message, 'success');
    const wrapper = await mountView();
    // Move to the second page so the reload target is observable: the
    // delete must reset the cursor back to the first page.
    await wrapper.findComponent(EntityListShell).vm.$emit('next');
    await flushPromises();
    expect(listEventSubscriptions).toHaveBeenLastCalledWith({ limit: 25, after: 'cursor-2' });
    await triggerRowDelete(wrapper);
    expect(confirmDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete DQ Alert',
        content: 'Delete this dq alert and all its metadata forever. This can\'t be undone.',
      }),
    );
    expect(deleteEventSubscription).toHaveBeenCalledWith('al1');
    expect(successSpy).toHaveBeenCalledWith('"DQ Alert" deleted successfully!');
    expect(getLimitByResource).toHaveBeenCalledTimes(1);
    expect(getLimitByResource).toHaveBeenCalledWith('eventsubscription');
    // The limit refresh runs before the reload, and the reload carries
    // no cursor: pin's fetchAlerts() reloads the first page.
    const limitOrder = getLimitByResource.mock.invocationCallOrder[0];
    const listOrders = listEventSubscriptions.mock.invocationCallOrder;
    expect(limitOrder).toBeLessThan(listOrders[listOrders.length - 1]!);
    expect(listEventSubscriptions).toHaveBeenLastCalledWith({ limit: 25, after: undefined });
    successSpy.mockRestore();
  });

  it('shows an error and does not reload or reset the cursor when the limit refresh fails', async () => {
    getLimitByResource.mockRejectedValue(new Error('limits down'));
    const errorSpy = vi.spyOn(message, 'error');
    const wrapper = await mountView();
    await wrapper.findComponent(EntityListShell).vm.$emit('next');
    await flushPromises();
    const loadsBeforeDelete = listEventSubscriptions.mock.calls.length;
    await triggerRowDelete(wrapper);
    expect(deleteEventSubscription).toHaveBeenCalledWith('al1');
    expect(getLimitByResource).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(listEventSubscriptions.mock.calls.length).toBe(loadsBeforeDelete);
    // The cursor is untouched: a manual refresh still loads page two.
    await wrapper.findComponent(EntityListShell).vm.$emit('refresh');
    await flushPromises();
    expect(listEventSubscriptions).toHaveBeenLastCalledWith({ limit: 25, after: 'cursor-2' });
    errorSpy.mockRestore();
  });

  it('does nothing when the delete confirmation is cancelled', async () => {
    confirmDelete.mockResolvedValue(false);
    const wrapper = await mountView();
    await triggerRowDelete(wrapper);
    expect(confirmDelete).toHaveBeenCalledTimes(1);
    expect(deleteEventSubscription).not.toHaveBeenCalled();
    expect(getLimitByResource).not.toHaveBeenCalled();
    expect(listEventSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('shows an error and neither refreshes the limit nor reloads when the delete fails', async () => {
    deleteEventSubscription.mockRejectedValue(new Error('delete boom'));
    const errorSpy = vi.spyOn(message, 'error');
    const wrapper = await mountView();
    await triggerRowDelete(wrapper);
    expect(deleteEventSubscription).toHaveBeenCalledWith('al1');
    expect(errorSpy).toHaveBeenCalled();
    expect(getLimitByResource).not.toHaveBeenCalled();
    expect(listEventSubscriptions).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
