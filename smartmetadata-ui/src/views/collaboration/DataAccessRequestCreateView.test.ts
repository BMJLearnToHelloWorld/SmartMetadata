/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import DataAccessRequestCreateView from './DataAccessRequestCreateView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/data-access-requests/new', name: 'data-access-request-new', component: DataAccessRequestCreateView },
      { path: '/tasks/:id', name: 'task', component: { template: '<div>task</div>' } },
    ],
  });
  await router.push('/data-access-requests/new');
  await router.isReady();
  const wrapper = mount(DataAccessRequestCreateView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('DataAccessRequestCreateView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('refuses to submit without target and reason', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="dar-submit"]').trigger('click');
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Target asset and business justification are required.');
  });

  it('requires columns for a column-level request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountView();
    // Antd Select has no jsdom-friendly option picker here, so the
    // scope is switched through the form state the view itself owns.
    const vm = wrapper.vm as unknown as { form: { accessType: string } };
    vm.form.accessType = 'ColumnLevel';
    await wrapper.find('[data-testid="dar-target-fqn"]').setValue('svc.db.schema.orders');
    await wrapper.find('[data-testid="dar-reason"]').setValue('support investigation');
    await wrapper.find('[data-testid="dar-submit"]').trigger('click');
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Column-level access requires at least one column.');
  });

  it('submits the spec payload and navigates to the created task', async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return jsonResponse({ id: 'dar9', name: 'dar-orders', type: 'DataAccessRequest', status: 'Open' });
      }),
    );
    const { wrapper, router } = await mountView();
    // Column scope is switched through form state: antd Select has no
    // jsdom-friendly option picker here.
    (wrapper.vm as unknown as { form: { accessType: string } }).form.accessType = 'ColumnLevel';
    await wrapper.find('[data-testid="dar-target-fqn"]').setValue('svc.db.schema.orders');
    await wrapper.find('[data-testid="dar-reason"]').setValue('support investigation');
    await wrapper.find('[data-testid="dar-columns"]').setValue('svc.db.schema.orders.email');
    await wrapper.find('[data-testid="dar-duration"]').setValue('P30D');
    await wrapper.find('[data-testid="dar-ticket-id"]').setValue('SUP-123');
    await wrapper.find('[data-testid="dar-submit"]').trigger('click');
    await flushPromises();
    expect(sentBody).toMatchObject({
      category: 'DataAccess',
      type: 'DataAccessRequest',
      about: '<#E::table::svc.db.schema.orders>',
      payload: {
        accessType: 'ColumnLevel',
        requestedAccess: 'Read',
        columns: ['svc.db.schema.orders.email'],
        duration: 'P30D',
        reason: 'support investigation',
        ticketId: 'SUP-123',
      },
    });
    expect(router.currentRoute.value.name).toBe('task');
    expect(router.currentRoute.value.params.id).toBe('dar9');
  });
});
