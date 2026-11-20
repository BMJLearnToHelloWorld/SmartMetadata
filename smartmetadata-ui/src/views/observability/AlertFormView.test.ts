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
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { ApiError } from '@/api/client';
import AlertFormSourceItem from '@/components/notifications/AlertFormSourceItem.vue';
import AlertRuleSection from '@/components/notifications/AlertRuleSection.vue';
import DestinationFormItem from '@/components/notifications/DestinationFormItem.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { createTestI18n } from '@/test/i18n';
import type { EventSubscription } from '@/types/quality';
import AlertFormView from './AlertFormView.vue';

const getAlertsFromName = vi.fn();
const getObservabilityAlertByFQN = vi.fn();
const getAlertCapabilities = vi.fn();
const createNotificationAlert = vi.fn();
const createObservabilityAlert = vi.fn();
const updateNotificationAlert = vi.fn();
const updateObservabilityAlert = vi.fn();
const getLimitByResource = vi.fn();
const getResourcePermission = vi.fn();
const getEntityPermissionByFqn = vi.fn();

vi.mock('@/api/eventSubscriptions', () => ({
  getAlertsFromName: (...args: unknown[]) => getAlertsFromName(...args),
  getObservabilityAlertByFQN: (...args: unknown[]) => getObservabilityAlertByFQN(...args),
  getAlertCapabilities: (...args: unknown[]) => getAlertCapabilities(...args),
  createNotificationAlert: (...args: unknown[]) => createNotificationAlert(...args),
  createObservabilityAlert: (...args: unknown[]) => createObservabilityAlert(...args),
  updateNotificationAlert: (...args: unknown[]) => updateNotificationAlert(...args),
  updateObservabilityAlert: (...args: unknown[]) => updateObservabilityAlert(...args),
}));

vi.mock('@/api/limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/limits')>();
  return { ...actual, getLimitByResource: (...args: unknown[]) => getLimitByResource(...args) };
});

vi.mock('@/api/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/permissions')>();
  return {
    ...actual,
    getResourcePermission: (...args: unknown[]) => getResourcePermission(...args),
    getEntityPermissionByFqn: (...args: unknown[]) => getEntityPermissionByFqn(...args),
  };
});

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
    input: { filters: [], actions: [] },
    destinations: [
      {
        id: 'd1',
        type: 'Email',
        category: 'External',
        config: { receivers: ['a@example.com'] },
        timeout: 10,
        readTimeout: 12,
      },
    ],
    ...overrides,
  } as EventSubscription;
}

const capabilities = {
  alertType: 'Observability',
  filters: [{ condition: { name: 'matchAll', effect: 'include', arguments: [] } }],
  sources: [{ name: 'table', kind: 'entity' }],
  triggers: [{ condition: { name: 'entityCreated', effect: 'include', arguments: [] } }],
  recipientCategories: ['Email'],
};

const stub = { template: '<div />' };
const editorStub = {
  props: ['initialValue', 'placeHolder'],
  emits: ['text-change'],
  template: '<textarea data-testid="description" :value="initialValue" />',
};

function grantCreate(): void {
  getResourcePermission.mockResolvedValue({
    resource: 'eventsubscription',
    permissions: [{ operation: 'Create', access: 'allow' }],
  });
}

function grantEdit(): void {
  getEntityPermissionByFqn.mockResolvedValue({
    resource: 'eventsubscription',
    permissions: [{ operation: 'EditAll', access: 'allow' }],
  });
}

async function mountView(path: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: stub },
      { path: '/settings/:category', name: 'settings-category', component: stub },
      {
        path: '/settings/notifications/add-notification',
        name: 'settings-add-notification',
        component: AlertFormView,
      },
      {
        path: '/settings/notifications/edit-notification/:fqn',
        name: 'settings-edit-notification',
        component: AlertFormView,
      },
      { path: '/observability/alerts', name: 'observability-alerts', component: stub },
      { path: '/observability/alerts/add', name: 'observability-alerts-add', component: AlertFormView },
      {
        path: '/observability/alerts/edit/:fqn',
        name: 'observability-alerts-edit',
        component: AlertFormView,
      },
      {
        path: '/observability/alert/:fqn/:tab',
        name: 'observability-alert-detail',
        component: stub,
      },
      {
        path: '/settings/notifications/alerts/:fqn/:tab',
        name: 'settings-notification-alert-detail',
        component: stub,
      },
    ],
  });
  await router.push('/observability/alerts');
  await router.push(path);
  await router.isReady();
  const wrapper = mount(AlertFormView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: { SmRichTextEditor: editorStub },
    },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  await flushPromises();
  await wrapper.vm.$nextTick();
  return { wrapper, router };
}

describe('AlertFormView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAlertCapabilities.mockResolvedValue(capabilities);
    getLimitByResource.mockResolvedValue(undefined);
    getAlertsFromName.mockResolvedValue(alertFixture({ alertType: 'Notification' }));
    getObservabilityAlertByFQN.mockResolvedValue(alertFixture());
    createObservabilityAlert.mockResolvedValue(alertFixture());
    createNotificationAlert.mockResolvedValue(alertFixture({ alertType: 'Notification' }));
    updateObservabilityAlert.mockResolvedValue(alertFixture());
    updateNotificationAlert.mockResolvedValue(alertFixture({ alertType: 'Notification' }));
    grantCreate();
    grantEdit();
  });

  it('renders the create form on the observability face, with both rule sections', async () => {
    const { wrapper } = await mountView('/observability/alerts/add');
    expect(wrapper.find('[data-testid="displayName"]').exists()).toBe(true);
    expect(wrapper.findComponent(AlertFormSourceItem).exists()).toBe(true);
    expect(wrapper.findComponent(DestinationFormItem).exists()).toBe(true);
    const sections = wrapper.findAllComponents(AlertRuleSection);
    expect(sections.map((section) => section.props('field'))).toEqual(['filters', 'actions']);
    expect(wrapper.find('[data-testid="save-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cancel-button"]').exists()).toBe(true);
  });

  it('never shows the Actions section on the notification face', async () => {
    const { wrapper } = await mountView('/settings/notifications/add-notification');
    const sections = wrapper.findAllComponents(AlertRuleSection);
    expect(sections.map((section) => section.props('field'))).toEqual(['filters']);
  });

  it('denies entry without the create permission, and fetches nothing', async () => {
    getResourcePermission.mockResolvedValue({
      resource: 'eventsubscription',
      permissions: [{ operation: 'ViewBasic', access: 'allow' }],
    });
    const { wrapper } = await mountView('/observability/alerts/add');
    expect(wrapper.find('[data-testid="displayName"]').exists()).toBe(false);
    const placeholder = wrapper.findComponent(PermissionPlaceholder);
    expect(placeholder.exists()).toBe(true);
    expect(String(placeholder.props('permissionValue'))).toContain('Create Alert');
    expect(getAlertCapabilities).not.toHaveBeenCalled();
  });

  it('denies entry on the settings face without the create permission, and issues no save (R-3)', async () => {
    getResourcePermission.mockResolvedValue({
      resource: 'eventsubscription',
      permissions: [{ operation: 'ViewBasic', access: 'allow' }],
    });
    const { wrapper } = await mountView('/settings/notifications/add-notification');
    expect(wrapper.find('[data-testid="displayName"]').exists()).toBe(false);
    const placeholder = wrapper.findComponent(PermissionPlaceholder);
    expect(placeholder.exists()).toBe(true);
    expect(String(placeholder.props('permissionValue'))).toContain('Create Alert');
    expect(getAlertCapabilities).not.toHaveBeenCalled();
    expect(createNotificationAlert).not.toHaveBeenCalled();
    expect(createObservabilityAlert).not.toHaveBeenCalled();
  });

  it('loads the edit form per face, prefilled from the stored alert', async () => {
    const { wrapper } = await mountView('/observability/alerts/edit/dq-alert');
    expect(getObservabilityAlertByFQN).toHaveBeenCalledWith('dq-alert');
    expect((wrapper.find('[data-testid="displayName"]').element as HTMLInputElement).value).toBe(
      'DQ Alert',
    );

    const notification = await mountView('/settings/notifications/edit-notification/dq-alert');
    expect(getAlertsFromName).toHaveBeenCalledWith('dq-alert');
    expect(
      (notification.wrapper.find('[data-testid="displayName"]').element as HTMLInputElement).value,
    ).toBe('DQ Alert');
  });

  it('shows the not-found placeholder for a 404 edit load', async () => {
    getObservabilityAlertByFQN.mockRejectedValue(new ApiError(404, ''));
    const { wrapper } = await mountView('/observability/alerts/edit/missing');
    expect(wrapper.find('[data-testid="displayName"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Alert not found');
  });

  it('shows the permission placeholder for a 403 edit load', async () => {
    getObservabilityAlertByFQN.mockRejectedValue(new ApiError(403, ''));
    const { wrapper } = await mountView('/observability/alerts/edit/dq-alert');
    expect(wrapper.text()).toContain('Edit Alert');
  });

  it('blocks editing a system-provider alert', async () => {
    getObservabilityAlertByFQN.mockResolvedValue(alertFixture({ provider: 'system' }));
    const { wrapper } = await mountView('/observability/alerts/edit/ActivityFeedAlert');
    expect(wrapper.find('[data-testid="displayName"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Editing a system generated alert is not allowed.');
  });

  it('shows the displayName error live once the field has been edited', async () => {
    const { wrapper } = await mountView('/observability/alerts/add');
    const input = wrapper.find('[data-testid="displayName"]');
    await input.setValue('bad::name"with-quote');
    expect(wrapper.find('.alert-form__hint').exists()).toBe(true);
    await input.setValue('Good Name');
    expect(wrapper.find('.alert-form__hint').exists()).toBe(false);
  });

  it('holds other errors until submit, and never saves while invalid', async () => {
    const { wrapper } = await mountView('/observability/alerts/add');
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(createObservabilityAlert).not.toHaveBeenCalled();
    expect(wrapper.findComponent(AlertFormSourceItem).props('error')).toBeTruthy();
  });

  it('creates, refreshes the limit, and lands on the new alert detail', async () => {
    const { wrapper, router } = await mountView('/observability/alerts/add');
    await wrapper.find('[data-testid="displayName"]').setValue('DQ Alert');
    await wrapper.findComponent(AlertFormSourceItem).vm.$emit('update:value', ['table']);
    await wrapper.findComponent(DestinationFormItem).vm.$emit('update:destinations', [
      {
        destinationType: 'Email',
        type: 'Email',
        category: 'External',
        config: { receivers: ['a@example.com'] },
      },
    ]);
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(createObservabilityAlert).toHaveBeenCalledTimes(1);
    expect(createObservabilityAlert.mock.calls[0]?.[0]).toMatchObject({
      displayName: 'DQ Alert',
      resources: ['table'],
    });
    expect(getLimitByResource).toHaveBeenCalledWith('eventsubscription');
    expect(router.currentRoute.value.path).toBe('/observability/alert/dq-alert/configuration');
  });

  it('updates by id on edit, without the limit refresh', async () => {
    const { wrapper, router } = await mountView('/observability/alerts/edit/dq-alert');
    await wrapper.find('[data-testid="displayName"]').setValue('Renamed Alert');
    await wrapper.findComponent(AlertFormSourceItem).vm.$emit('update:value', ['table']);
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(updateObservabilityAlert).toHaveBeenCalledTimes(1);
    expect(updateObservabilityAlert.mock.calls[0]?.[0]).toBe('a1');
    expect(getLimitByResource).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/observability/alert/dq-alert/configuration');
  });

  it('goes back on cancel', async () => {
    const { wrapper, router } = await mountView('/observability/alerts/add');
    await wrapper.find('[data-testid="cancel-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/observability/alerts');
  });

  it('shows the read-only rules alert when the stored rules have no selections', async () => {
    getObservabilityAlertByFQN.mockResolvedValue(
      alertFixture({
        input: undefined,
        filteringRules: { resources: ['table'], rules: [{ name: 'matchAll' }] } as never,
      }),
    );
    const { wrapper } = await mountView('/observability/alerts/edit/dq-alert');
    expect(wrapper.find('[data-testid="alert-rules-read-only"]').exists()).toBe(true);
    const sections = wrapper.findAllComponents(AlertRuleSection);
    expect(sections.every((section) => section.props('isViewOnly'))).toBe(true);
  });
});
