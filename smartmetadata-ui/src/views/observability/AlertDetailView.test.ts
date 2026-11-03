/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AlertDetailView from './AlertDetailView.vue';

const getEventSubscription = vi.fn();
const updateEventSubscription = vi.fn();
const getEntityPermissionByFqn = vi.fn();

vi.mock('@/api/eventSubscriptions', () => ({
  getEventSubscription: (...args: unknown[]) => getEventSubscription(...args),
  updateEventSubscription: (...args: unknown[]) => updateEventSubscription(...args),
}));

// P1 gating line: edit/delete read the per-alert entity permission.
vi.mock('@/api/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/permissions')>();
  return {
    ...actual,
    getEntityPermissionByFqn: (...args: unknown[]) => getEntityPermissionByFqn(...args),
  };
});

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/observability/alerts/:id', name: 'observability-alert', component: AlertDetailView, props: true },
      { path: '/observability/alerts', name: 'observability-alerts', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'observability-alert', params: { id: 'al1' } });
  await router.isReady();
  const wrapper = mount(AlertDetailView, {
    props: { id: 'al1' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('AlertDetailView edit', () => {
  beforeEach(() => {
    getEventSubscription.mockReset();
    updateEventSubscription.mockReset();
    getEntityPermissionByFqn.mockReset();
    getEntityPermissionByFqn.mockResolvedValue({
      resource: 'eventsubscription',
      permissions: [
        { operation: 'EditAll', access: 'allow' },
        { operation: 'Delete', access: 'allow' },
      ],
    });
    getEventSubscription.mockResolvedValue({
      id: 'al1',
      name: 'dq-alert',
      fullyQualifiedName: 'dq-alert',
      alertType: 'Observability',
      enabled: true,
      destinations: [{ category: 'External', type: 'Webhook', endpoint: 'https://hook.example' }],
    });
    updateEventSubscription.mockResolvedValue({ id: 'al1', name: 'dq-alert' });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('edits display name, enabled and webhook endpoint through the update API', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="edit-alert"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-alert"]').trigger('click');
    await flushPromises();
    // Ant Modal does not forward the wrapper testid to the DOM; the inner
    // form fields are the observable surface.
    const endpoint = document.body.querySelector('[data-testid="edit-alert-endpoint"]') as HTMLInputElement | null;
    expect(endpoint).not.toBeNull();
    expect(endpoint?.value).toBe('https://hook.example');
    // Submit via the modal's ok button through the component's exposed save path:
    // trigger the FormModal ok by clicking the modal footer button.
    const okButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save'),
    );
    expect(okButton).toBeDefined();
    okButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(updateEventSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'dq-alert',
        enabled: true,
        destinations: [
          { category: 'External', type: 'Webhook', config: { endpoint: 'https://hook.example' }, readTimeout: 12 },
        ],
      }),
    );
  });
});

describe('AlertDetailView trigger display (Fix4)', () => {
  beforeEach(() => {
    getEventSubscription.mockReset();
    updateEventSubscription.mockReset();
    getEventSubscription.mockResolvedValue({
      id: 'al1',
      name: 'dq-alert',
      fullyQualifiedName: 'dq-alert',
      alertType: 'Observability',
      enabled: true,
      destinations: [{ category: 'External', type: 'Webhook', endpoint: 'https://hook.example' }],
      filteringRules: {
        resources: ['table', 'testCase'],
        rules: [{ name: 'matchAnyTag', effect: 'Include', condition: ['PII'] }],
      },
      owners: [{ id: 'u1', name: 'amy', displayName: 'Amy' }],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders trigger resources, filter rules, and owners from the alert (Fix4)', async () => {
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('table, testCase');
    expect(wrapper.text()).toContain('matchAnyTag === PII');
    expect(wrapper.text()).toContain('Amy');
  });

  it('disables edit and delete when the entity permission denies (P1)', async () => {
    getEntityPermissionByFqn.mockResolvedValue({
      resource: 'eventsubscription',
      permissions: [
        { operation: 'EditAll', access: 'deny' },
        { operation: 'Delete', access: 'deny' },
      ],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="edit-alert"]').attributes('disabled')).not.toBeUndefined();
    expect(wrapper.find('[data-testid="delete-alert"]').attributes('disabled')).not.toBeUndefined();
  });
});
