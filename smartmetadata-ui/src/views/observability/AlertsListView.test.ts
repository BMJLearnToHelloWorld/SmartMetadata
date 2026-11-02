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
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AlertsListView from './AlertsListView.vue';

const listEventSubscriptions = vi.fn();
const createEventSubscription = vi.fn();
const deleteEventSubscription = vi.fn();

vi.mock('@/api/eventSubscriptions', () => ({
  listEventSubscriptions: (...args: unknown[]) => listEventSubscriptions(...args),
  createEventSubscription: (...args: unknown[]) => createEventSubscription(...args),
  deleteEventSubscription: (...args: unknown[]) => deleteEventSubscription(...args),
}));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/observability/alerts', name: 'observability-alerts', component: AlertsListView },
      { path: '/observability/alerts/:id', name: 'observability-alert', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'observability-alerts' });
  await router.isReady();
  const wrapper = mount(AlertsListView, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('AlertsListView create form (Fix4)', () => {
  beforeEach(() => {
    listEventSubscriptions.mockReset();
    createEventSubscription.mockReset();
    deleteEventSubscription.mockReset();
    listEventSubscriptions.mockResolvedValue({ data: [], total: 0, after: undefined });
    createEventSubscription.mockResolvedValue({ id: 'al1', name: 'dq-webhook' });
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
          { category: 'External', type: 'Webhook', config: { endpoint: 'https://example.com/hook', readTimeout: 12 } },
        ],
      }),
    );
  });
});
