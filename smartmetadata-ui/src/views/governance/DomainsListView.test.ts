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
import Antd, { Modal } from 'ant-design-vue';
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

const listBody = {
  data: [
    {
      id: 'd1',
      name: 'Marketing',
      fullyQualifiedName: 'Marketing',
      description: 'Growth',
      domainType: 'Consumer-aligned',
    },
    {
      id: 'd2',
      name: 'Sales',
      fullyQualifiedName: 'Sales',
      description: 'Deals',
      domainType: 'Source-aligned',
    },
  ],
  paging: { total: 2 },
};

const searchBody = {
  hits: {
    total: { value: 1 },
    hits: [
      {
        _index: 'domain_search_index',
        _id: 'd1',
        _source: {
          id: 'd1',
          name: 'Marketing',
          fullyQualifiedName: 'Marketing',
          description: 'Growth',
          domainType: 'Consumer-aligned',
          childrenCount: 1,
        },
      },
    ],
  },
};

const hierarchyBody = {
  data: [
    { id: 'd1', name: 'Marketing', fullyQualifiedName: 'Marketing', domainType: 'Consumer-aligned', childrenCount: 1 },
    { id: 'd2', name: 'Sales', fullyQualifiedName: 'Sales', domainType: 'Source-aligned', childrenCount: 0 },
  ],
  paging: { total: 2 },
};

describe('DomainsListView', () => {
  let deletedIds = new Set<string>();
  let failDeleteId: string | null = null;

  beforeEach(() => {
    deletedIds = new Set<string>();
    failDeleteId = null;
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse(searchBody);
        }
        if (url.includes('/api/v1/domains/hierarchy')) {
          return jsonResponse(hierarchyBody);
        }
        if (url.includes('/api/v1/domains/')) {
          const id = url.split('/api/v1/domains/')[1]?.split('?')[0];
          if (init?.method === 'DELETE') {
            if (id && failDeleteId === id) {
              return new Response('delete failed', { status: 500 });
            }
            if (id) {
              deletedIds.add(id);
            }
            return jsonResponse({});
          }
          return new Response('not found', { status: 404 });
        }
        if (url.includes('/api/v1/domains')) {
          return jsonResponse({
            data: listBody.data.filter((domain) => !deletedIds.has(domain.id)),
            paging: { total: listBody.data.length - deletedIds.size },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  describe('create permission gate (pin DomainListPage.tsx:153)', () => {
    async function mountWithDomainOps(operations: Array<{ operation: string; access: string }>) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('/v1/permissions/domain')) {
            return jsonResponse({ resource: 'domain', permissions: operations });
          }
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
      await flushPromises();
      return wrapper;
    }

    it('shows the create button with a domain Create grant', async () => {
      const wrapper = await mountWithDomainOps([{ operation: 'Create', access: 'allow' }]);
      expect(wrapper.find('[data-testid="create-domain"]').exists()).toBe(true);
    });

    it('hides the create button without a domain Create grant', async () => {
      const wrapper = await mountWithDomainOps([]);
      expect(wrapper.find('[data-testid="create-domain"]').exists()).toBe(false);
    });
  });

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

  describe('view toggle (B-10)', () => {
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
  });

  describe('search (G2)', () => {
    it('debounces the search box by 300ms and queries the domain index', async () => {
      vi.useFakeTimers();
      const { wrapper } = await mountView();
      expect(wrapper.text()).toContain('Sales');
      const search = wrapper.find('[data-testid="entity-list-search"]');
      await search.setValue('market');
      // Still debouncing: no search request yet.
      expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/v1/search/query'))).toBe(
        false,
      );
      await vi.advanceTimersByTimeAsync(300);
      await flushPromises();
      const searchCalls = vi.mocked(fetch).mock.calls.filter((call) =>
        String(call[0]).includes('/v1/search/query'),
      );
      expect(searchCalls).toHaveLength(1);
      expect(String(searchCalls[0]?.[0])).toContain('index=domain');
      expect(String(searchCalls[0]?.[0])).toContain('q=market');
      expect(wrapper.text()).toContain('Marketing');
      expect(wrapper.text()).not.toContain('Sales');
      // Clearing the search restores the REST list from the first page.
      await search.setValue('');
      await vi.advanceTimersByTimeAsync(300);
      await flushPromises();
      expect(wrapper.text()).toContain('Sales');
      vi.useRealTimers();
      wrapper.unmount();
    });

    it('applies the search immediately on Enter', async () => {
      vi.useFakeTimers();
      const { wrapper } = await mountView();
      const search = wrapper.find('[data-testid="entity-list-search"]');
      await search.setValue('market');
      await search.trigger('keydown.enter');
      await flushPromises();
      expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/v1/search/query'))).toBe(
        true,
      );
      expect(wrapper.text()).not.toContain('Sales');
      vi.useRealTimers();
      wrapper.unmount();
    });
  });

  describe('bulk delete (G2)', () => {
    async function selectAllRows(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
      const checkbox = wrapper.find('.ant-table-thead .ant-checkbox-input');
      (checkbox.element as HTMLInputElement).checked = true;
      await checkbox.trigger('change');
      await flushPromises();
    }

    function confirmModal() {
      vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
        void Promise.resolve(config.onOk?.());
        return { destroy: vi.fn(), update: vi.fn() } as never;
      });
    }

    function deleteCalls() {
      return vi
        .mocked(fetch)
        .mock.calls.filter(
          (call) => String(call[0]).includes('/api/v1/domains/') && (call[1] as RequestInit | undefined)?.method === 'DELETE',
        );
    }

    it('bulk deletes the selected domains, clears the selection, and reloads', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.find('[data-testid="domains-bulk-bar"]').exists()).toBe(false);
      await selectAllRows(wrapper);
      expect(wrapper.find('[data-testid="domains-bulk-bar"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('2 selected');
      confirmModal();
      await wrapper.get('[data-testid="domains-bulk-delete"]').trigger('click');
      await flushPromises();
      const deletes = deleteCalls();
      expect(deletes.map((call) => String(call[0]))).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/api/v1/domains/d1'),
          expect.stringContaining('/api/v1/domains/d2'),
        ]),
      );
      expect(deletes).toHaveLength(2);
      expect(wrapper.find('[data-testid="domains-bulk-bar"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('keeps the failed rows selected when a bulk delete partially fails', async () => {
      failDeleteId = 'd2';
      const { wrapper } = await mountView();
      await selectAllRows(wrapper);
      confirmModal();
      await wrapper.get('[data-testid="domains-bulk-delete"]').trigger('click');
      await flushPromises();
      expect(deleteCalls()).toHaveLength(2);
      // The failed row stays selected so it can be retried; the deleted
      // one is gone from the reloaded list.
      expect(wrapper.find('[data-testid="domains-bulk-bar"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('1 selected');
      expect(wrapper.text()).toContain('Sales');
      expect(wrapper.text()).not.toContain('Marketing');
      wrapper.unmount();
    });

    it('clears the selection from the bulk bar', async () => {
      const { wrapper } = await mountView();
      await selectAllRows(wrapper);
      expect(wrapper.find('[data-testid="domains-bulk-bar"]').exists()).toBe(true);
      await wrapper.get('[data-testid="domains-clear-selection"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="domains-bulk-bar"]').exists()).toBe(false);
      wrapper.unmount();
    });
  });

  describe('tree view (G2)', () => {
    it('switches to the tree view and renders the hierarchy', async () => {
      const { wrapper } = await mountView();
      await wrapper.findAll('.ant-segmented-item')[2].trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="domains-tree"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="domains-table"]').exists()).toBe(false);
      expect(wrapper.text()).toContain('Marketing');
      const hierarchyCalls = vi
        .mocked(fetch)
        .mock.calls.map((call) => String(call[0]))
        .filter((url) => url.includes('/api/v1/domains/hierarchy'));
      expect(hierarchyCalls).toHaveLength(1);
      wrapper.unmount();
    });

    it('starts in tree view when the persona document stores it', async () => {
      const { wrapper, store } = await mountView();
      seedStoredView(store, 'tree');
      await flushPromises();
      expect(wrapper.find('[data-testid="domains-tree"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="domains-table"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="domains-cards"]').exists()).toBe(false);
      wrapper.unmount();
    });
  });
});
