/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import MetricCreateDrawer from './MetricCreateDrawer.vue';

const getIntakeFormByEntityType = vi.fn();
const listCustomProperties = vi.fn();
const createMetric = vi.fn();

vi.mock('@/api/intakeForms', () => ({
  getIntakeFormByEntityType: (...args: unknown[]) => getIntakeFormByEntityType(...args),
}));
vi.mock('@/api/customProperties', () => ({
  listCustomProperties: (...args: unknown[]) => listCustomProperties(...args),
  getPropertyConfigSummary: () => ({ kind: 'format' }),
}));
vi.mock('@/api/metrics', () => ({
  createMetric: (...args: unknown[]) => createMetric(...args),
}));
vi.mock('@/features/metrics/metricOptionLoaders', () => ({
  fetchDomainOptions: vi.fn(async () => []),
  fetchParentMetricOptions: vi.fn(async () => []),
  fetchRelatedMetricOptions: vi.fn(async () => []),
  fetchUserTeamOptions: vi.fn(async () => []),
}));

function bodyQuery(selector: string): Element | null {
  return document.body.querySelector(selector);
}

function mountDrawer(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div>home</div>' } }],
  });
  return mount(MetricCreateDrawer, {
    attachTo: document.body,
    props: { open: false, ...props },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
}

async function openDrawer(props: Record<string, unknown> = {}) {
  getIntakeFormByEntityType.mockResolvedValue({
    id: 'f1',
    name: 'metric',
    entityType: 'metric',
    formFields: [],
    requiredFields: [],
  });
  listCustomProperties.mockResolvedValue([]);
  const wrapper = mountDrawer(props);
  await wrapper.setProps({ open: true });
  await flushPromises();
  await vi.waitFor(() => {
    expect(bodyQuery('[data-testid="metric-create-form"]')).not.toBeNull();
  });
  return wrapper;
}

describe('MetricCreateDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form once the intake form loads', async () => {
    const wrapper = await openDrawer();
    expect(bodyQuery('[data-testid="metric-create-name"]')).not.toBeNull();
    expect(bodyQuery('[data-testid="metric-create-code"]')).not.toBeNull();
    expect(bodyQuery('[data-testid="metric-create-metric-type"]')).not.toBeNull();
    const save = bodyQuery('[data-testid="metric-create-drawer-save"]') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    wrapper.unmount();
  });

  it('blocks submit on validation errors and keeps the drawer open', async () => {
    const wrapper = await openDrawer();
    const save = bodyQuery('[data-testid="metric-create-drawer-save"]') as HTMLButtonElement;
    save.click();
    await flushPromises();
    expect(createMetric).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('is required');
    expect(wrapper.emitted('update:open')).toBeUndefined();
    wrapper.unmount();
  });

  it('submits the payload, emits created with the FQN, and closes on success', async () => {
    const wrapper = await openDrawer();
    createMetric.mockResolvedValue({
      id: 'm1',
      name: 'orders_per_day',
      fullyQualifiedName: 'orders_per_day',
    });
    const nameInput = bodyQuery('[data-testid="metric-create-name"]') as HTMLInputElement;
    const codeInput = bodyQuery('[data-testid="metric-create-code"]') as HTMLInputElement;
    nameInput.value = 'orders_per_day';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    codeInput.value = 'SELECT COUNT(*) FROM orders';
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    const save = bodyQuery('[data-testid="metric-create-drawer-save"]') as HTMLButtonElement;
    save.click();
    await flushPromises();
    expect(createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'orders_per_day',
        metricExpression: { language: 'SQL', code: 'SELECT COUNT(*) FROM orders' },
      }),
    );
    expect(wrapper.emitted('created')).toEqual([['orders_per_day']]);
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    wrapper.unmount();
  });

  it('stays open with the form intact when create fails', async () => {
    const wrapper = await openDrawer();
    createMetric.mockRejectedValue(new Error('create failed'));
    const nameInput = bodyQuery('[data-testid="metric-create-name"]') as HTMLInputElement;
    const codeInput = bodyQuery('[data-testid="metric-create-code"]') as HTMLInputElement;
    nameInput.value = 'orders_per_day';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    codeInput.value = 'SELECT 1';
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    const save = bodyQuery('[data-testid="metric-create-drawer-save"]') as HTMLButtonElement;
    save.click();
    await flushPromises();
    expect(createMetric).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('created')).toBeUndefined();
    expect(wrapper.emitted('update:open')).toBeUndefined();
    // The form keeps its values: the name input still holds the typed value.
    expect((bodyQuery('[data-testid="metric-create-name"]') as HTMLInputElement).value).toBe(
      'orders_per_day',
    );
    wrapper.unmount();
  });

  it('shows the intake error state and retries on demand', async () => {
    getIntakeFormByEntityType
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(null);
    listCustomProperties.mockResolvedValue([]);
    const wrapper = mountDrawer();
    await wrapper.setProps({ open: true });
    await flushPromises();
    await vi.waitFor(() => {
      expect(bodyQuery('[data-testid="metric-create-intake-error"]')).not.toBeNull();
    });
    const retry = bodyQuery('[data-testid="metric-intake-retry"]') as HTMLButtonElement;
    retry.click();
    await flushPromises();
    await vi.waitFor(() => {
      expect(bodyQuery('[data-testid="metric-create-form"]')).not.toBeNull();
    });
    expect(getIntakeFormByEntityType).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('shows the parent-inherited alert and hides the parent picker when created from a parent', async () => {
    const wrapper = await openDrawer({ parentMetricFqn: 'parent.metric' });
    expect(bodyQuery('[data-testid="parent-metric-inherited"]')).not.toBeNull();
    expect(bodyQuery('[data-testid="metric-create-parent-metric"]')).toBeNull();
    wrapper.unmount();
  });
});
