/**
 * Copyright 2026 SmartMetadata authors.
 *
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
import { usePersonaStore } from '@/stores/persona';
import { createTestI18n } from '@/test/i18n';
import DomainsListView from './DomainsListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('DomainsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/domains')) {
          return jsonResponse({
            data: [
              {
                id: 'd1',
                name: 'Marketing',
                fullyQualifiedName: 'Marketing',
                description: 'Growth',
                domainType: 'Consumer-aligned',
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders domains from GET /v1/domains', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains', name: 'governance-domains', component: DomainsListView },
        { path: '/governance/domains/:fqn', name: 'governance-domain', component: { template: '<div>d</div>' } },
      ],
    });
    await router.push('/governance/domains');
    await router.isReady();
    const wrapper = mount(DomainsListView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Marketing');
    expect(wrapper.text()).toContain('Consumer-aligned');
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="domains-table"]').exists()).toBe(true);
    await wrapper.find('[data-testid="domain-row-d1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-domain');
    expect(router.currentRoute.value.params).toMatchObject({ fqn: 'Marketing' });
  });

  it('requests the next cursor page from GET /v1/domains', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/domains')) {
        const after = new URL(url, 'http://localhost').searchParams.get('after');
        return jsonResponse({
          data: [
            {
              id: after === 'c1' ? 'd2' : 'd1',
              name: after === 'c1' ? 'Sales' : 'Marketing',
              domainType: after === 'c1' ? 'Source-aligned' : 'Consumer-aligned',
            },
          ],
          paging: { total: 2, after: after === 'c1' ? undefined : 'c1' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/governance/domains', name: 'governance-domains', component: DomainsListView }],
    });
    await router.push('/governance/domains');
    await router.isReady();
    const wrapper = mount(DomainsListView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Marketing');
    await wrapper.get('[data-testid="entity-list-next"]').trigger('click');
    await flushPromises();
    const domainCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/domains'));
    expect(domainCalls.some((url) => url.includes('after=c1'))).toBe(true);
    expect(wrapper.text()).toContain('Sales');
  });

  describe('view toggle (B-10)', () => {
    async function mountView() {
      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/governance/domains', name: 'governance-domains', component: DomainsListView },
          { path: '/governance/domains/:fqn', name: 'governance-domain', component: { template: '<div>d</div>' } },
        ],
      });
      await router.push('/governance/domains');
      await router.isReady();
      const wrapper = mount(DomainsListView, {
        // attachTo: jsdom label activation (the Segmented's radio
        // input) only fires for nodes connected to the document.
        attachTo: document.body,
        global: { plugins: [pinia, router, Antd, createTestI18n()] },
      });
      await flushPromises();
      return { wrapper, router, store: usePersonaStore() };
    }

    function seedStoredView(store: ReturnType<typeof usePersonaStore>, view: string): void {
      store.selectedPersonaId = 'p1';
      store.document = {
        name: 'p1',
        fullyQualifiedName: 'persona.p1',
        entityType: 'Page',
        data: {
          pages: [],
          personaPreferences: [{ personaId: 'p1', defaultViewModes: { domains: view } }],
        },
      } as never;
    }

    it('defaults to the table view and switches to cards from the toggle', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.find('[data-testid="domains-table"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="domains-cards"]').exists()).toBe(false);
      await wrapper.findAll('.ant-segmented-item')[1].trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="domains-cards"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="domains-table"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="domains-cards-d1"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('opens the domain detail from a card click', async () => {
      const { wrapper, router } = await mountView();
      await wrapper.findAll('.ant-segmented-item')[1].trigger('click');
      await flushPromises();
      await wrapper.find('[data-testid="domains-cards-open-d1"]').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('governance-domain');
      expect(router.currentRoute.value.params).toMatchObject({ fqn: 'Marketing' });
      wrapper.unmount();
    });

    it('starts in card view when the persona document stores it', async () => {
      const { wrapper, store } = await mountView();
      seedStoredView(store, 'card');
      await flushPromises();
      expect(wrapper.find('[data-testid="domains-cards"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="domains-table"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('renders the table when the stored view is tree, which the toggle does not offer', async () => {
      // 'tree' is in the page's offered views (pin declares it), so
      // the resolver keeps it — but the toggle offers only table/card,
      // and the table is the rendering for any non-card view.
      const { wrapper, store } = await mountView();
      seedStoredView(store, 'tree');
      await flushPromises();
      expect(wrapper.find('[data-testid="domains-table"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="domains-cards"]').exists()).toBe(false);
      wrapper.unmount();
    });
  });
});
