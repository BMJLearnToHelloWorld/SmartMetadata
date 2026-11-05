/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AddAssetsModal from '@/features/crud/AddAssetsModal.vue';
import DomainDetailView from './DomainDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('DomainDetailView delete', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/domains/d1/assets')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/domains/d1') && init?.method === 'DELETE') {
          return jsonResponse({});
        }
        if (url.includes('/api/v1/domains/d1')) {
          return jsonResponse({
            id: 'd1',
            name: 'Finance',
            displayName: 'Finance Domain',
            description: 'Finance assets',
            domainType: 'Consumer-aligned',
            owners: [],
            experts: [],
            tags: [],
            children: [],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('confirms, deletes, and navigates back to the domains list', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:id', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/d1');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { id: 'd1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    const deleteButton = wrapper.find('[data-testid="delete-domain"]');
    expect(deleteButton.exists()).toBe(true);
    await deleteButton.trigger('click');
    await flushPromises();
    const confirm = document.querySelector('.sm-confirm-delete');
    expect(confirm).not.toBeNull();
    const okButton = confirm?.querySelector('.ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    await flushPromises();
    const deleteCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall?.[0])).toContain('/api/v1/domains/d1');
    expect(router.currentRoute.value.name).toBe('governance-domains');
    wrapper.unmount();
  });

  it('renders activity and custom-properties tabs with asset writes denied without a grant', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:id', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/d1');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { id: 'd1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    // The stub answers 404 for the permission endpoint, so the view must
    // fail closed: the add-assets button renders disabled.
    expect(wrapper.text()).toContain('Activity');
    expect(wrapper.text()).toContain('Custom Properties');
    const addButton = wrapper.find('[data-testid="add-domain-assets"]');
    expect(addButton.exists()).toBe(true);
    expect((addButton.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });
});

describe('DomainDetailView dryRun', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'PUT' && url.includes('/assets/add')) {
          const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
          if (body.dryRun === true) {
            return jsonResponse({
              successRequest: [
                {
                  request: { id: 'a1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.orders' },
                  hasSideEffects: true,
                  message: 'moves from another domain',
                },
              ],
              failedRequest: [],
            });
          }
          return jsonResponse({ successRequest: [], failedRequest: [] });
        }
        if (url.includes('/api/v1/domains/d1/assets')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/domains/d1')) {
          return jsonResponse({
            id: 'd1',
            name: 'Finance',
            displayName: 'Finance Domain',
            description: 'Finance assets',
            domainType: 'Consumer-aligned',
            owners: [],
            experts: [],
            tags: [],
            children: [],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('dryRuns on confirm, shows impacts, and only submits after confirmation', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>list</div>' } },
        { path: '/governance/domains/:id', name: 'governance-domain', component: DomainDetailView, props: true },
      ],
    });
    await router.push('/governance/domains/d1');
    await router.isReady();
    const wrapper = mount(DomainDetailView, {
      props: { id: 'd1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    const modal = wrapper.findComponent(AddAssetsModal);
    expect(modal.exists()).toBe(true);
    (modal.vm as unknown as { $emit: (event: string, value: unknown) => void }).$emit('confirm', [
      { id: 'a1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.orders' },
    ]);
    await flushPromises();
    const puts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(JSON.parse(String(puts[0][1]?.body))).toMatchObject({ dryRun: true });
    expect(wrapper.find('[data-testid="domain-dryrun-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('svc.db.orders');

    await wrapper.find('[data-testid="domain-dryrun-confirm"]').trigger('click');
    await flushPromises();
    const putsAfter = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putsAfter).toHaveLength(2);
    expect(JSON.parse(String(putsAfter[1][1]?.body))).not.toHaveProperty('dryRun');
    expect(wrapper.find('[data-testid="domain-dryrun-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
