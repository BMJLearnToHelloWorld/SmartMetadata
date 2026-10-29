/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import LineageView from './LineageView.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());
vi.mock('@vue-flow/minimap', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/minimap']());

vi.mock('@/api/search', () => ({
  searchAssets: vi.fn(async () => ({ total: 0, hits: [], facets: [] })),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const GRAPH = {
  entity: {
    id: 'center-id',
    type: 'table',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
  },
  nodes: [
    {
      id: 'up-id',
      type: 'table',
      name: 'raw_orders',
      fullyQualifiedName: 'svc.db.schema.raw_orders',
    },
  ],
  upstreamEdges: [
    {
      fromEntity: 'up-id',
      toEntity: 'center-id',
      lineageDetails: {
        columnsLineage: [{ fromColumns: ['raw_orders.id'], toColumn: 'orders.id' }],
      },
    },
  ],
  downstreamEdges: [],
};

async function mountLineage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: LineageView, props: true },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push({ name: 'lineage', params: { entityType: 'table', fqn: 'svc.db.schema.orders' } });
  await router.isReady();
  const wrapper = mount(LineageView, {
    props: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('LineageView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders nodes from GET /v1/lineage/{entity}/name/{fqn} and shows column mappings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(GRAPH)),
    );
    const { wrapper } = await mountLineage();
    expect(wrapper.text()).toContain('raw_orders');
    expect(wrapper.text()).toContain('orders');
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-find-node"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="column-lineage-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('raw_orders.id');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('/api/v1/lineage/table/name/');
  });

  it('shows an empty state when the API returns only the focus entity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          entity: { id: 'center-id', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' },
          nodes: [],
          upstreamEdges: [],
          downstreamEdges: [],
        }),
      ),
    );
    const { wrapper } = await mountLineage();
    expect(wrapper.text()).toContain('No upstream or downstream lineage at this depth');
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(false);
  });

  it('shows the API error when lineage GET fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'lineage not found' }, 404)),
    );
    const { wrapper } = await mountLineage();
    expect(wrapper.text()).toContain('lineage not found');
  });

  it('navigates to asset detail when a supported node is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(GRAPH)));
    const { wrapper, router } = await mountLineage();
    await wrapper.get('[data-testid="lineage-node-up-id"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.raw_orders',
    });
  });

  it('refetches when upstream depth changes', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountLineage();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('upstreamDepth=1');
    await wrapper.get('[data-testid="upstream-depth-inc"]').trigger('click');
    await wrapper.get('[data-testid="upstream-depth-inc"]').trigger('click');
    await flushPromises();
    const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(lastUrl).toContain('upstreamDepth=3');
  });

  it('connect stub PUTs lineage edge then reloads GET', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'PUT' && String(input).includes('/api/v1/lineage/')) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountLineage();
    await wrapper.get('[data-testid="vue-flow-connect-stub"]').trigger('click');
    await flushPromises();
    const putCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === 'PUT',
    );
    expect(putCall).toBeTruthy();
    expect(String(putCall?.[0])).toContain(
      '/api/v1/lineage/table/name/svc.db.schema.orders/table/name/svc.db.schema.raw_orders',
    );
    expect(JSON.parse(String((putCall?.[1] as RequestInit).body))).toEqual({ source: 'Manual' });
    expect(
      fetchMock.mock.calls.filter(
        (call) => ((call[1] as RequestInit | undefined)?.method ?? 'GET') === 'GET',
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

});
