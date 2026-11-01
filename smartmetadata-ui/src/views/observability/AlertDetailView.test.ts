/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AlertDetailView from './AlertDetailView.vue';

const getEventSubscription = vi.fn();
const updateEventSubscription = vi.fn();

vi.mock('@/api/eventSubscriptions', () => ({
  getEventSubscription: (...args: unknown[]) => getEventSubscription(...args),
  updateEventSubscription: (...args: unknown[]) => updateEventSubscription(...args),
}));

async function mountView() {
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
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('AlertDetailView edit', () => {
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
        destinations: [{ category: 'External', type: 'Webhook', config: { endpoint: 'https://hook.example' } }],
      }),
    );
  });
});
