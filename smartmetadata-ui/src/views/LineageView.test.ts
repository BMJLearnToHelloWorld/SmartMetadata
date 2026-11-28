/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import LineageGraph from '@/components/lineage/LineageGraph.vue';
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
  nodes: {
    'svc.db.schema.orders': {
      entity: {
        id: 'center-id',
        type: 'table',
        name: 'orders',
        fullyQualifiedName: 'svc.db.schema.orders',
      },
      nodeDepth: 0,
    },
    'svc.db.schema.raw_orders': {
      entity: {
        id: 'up-id',
        type: 'table',
        name: 'raw_orders',
        fullyQualifiedName: 'svc.db.schema.raw_orders',
      },
      nodeDepth: 1,
    },
  },
  upstreamEdges: {
    e1: {
      fromEntity: { id: 'up-id', fullyQualifiedName: 'svc.db.schema.raw_orders', type: 'table' },
      toEntity: { id: 'center-id', fullyQualifiedName: 'svc.db.schema.orders', type: 'table' },
      columns: [{ fromColumns: ['svc.db.schema.raw_orders.id'], toColumn: 'svc.db.schema.orders.id' }],
    },
  },
  downstreamEdges: {},
};

async function mountLineage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: LineageView, props: true },
      { path: '/:entityType/:fqn/:tab/:subTab', name: 'asset-subtab', component: { template: '<div>asset</div>' } },
      { path: '/:entityType/:fqn/:tab', name: 'asset-tab', component: { template: '<div>asset</div>' } },
      { path: '/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
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
    // The drawer and config modal teleport to document.body; clear
    // them so a stale panel cannot leak into the next test's queries.
    document.body.innerHTML = '';
  });

  it('renders nodes from GET /v1/lineage/getLineage and shows column mappings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(GRAPH)),
    );
    const { wrapper } = await mountLineage();
    // ELK layout is async: node buttons render only once positions resolve.
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-up-id"]').exists()).toBe(true));
    expect(wrapper.text()).toContain('raw_orders');
    expect(wrapper.text()).toContain('orders');
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(true);
    // 2026-11-25 lineage-controls: find-node moved to the canvas search
    // select (LineageSearchSelect); the standalone column-lineage table
    // was deleted per B-7(c) — column mappings now render inside the
    // node card. The vue-flow stub renders plain node buttons, never
    // the card, so the mapping is asserted where it lands in the
    // rendered graph: the upstream node's columns carry the edge's
    // from-column. (Card rendering itself is covered by
    // LineageNode.test.ts.)
    expect(wrapper.find('[data-testid="lineage-search-select"]').exists()).toBe(true);
    const flow = wrapper.findComponent({ name: 'VueFlow' });
    const flowNodes = flow.props('nodes') as {
      id: string;
      data: { columns?: { fqn: string }[] };
    }[];
    const upNode = flowNodes.find((node) => node.id === 'up-id');
    expect(upNode?.data.columns?.map((column) => column.fqn)).toContain(
      'svc.db.schema.raw_orders.id',
    );
    const lineageCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => String(call[0]).includes('/api/v1/lineage/getLineage'));
    expect(lineageCall?.[0]).toContain('/api/v1/lineage/getLineage');
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

  it('opens the node detail drawer from the node name and navigates to asset detail from its link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(GRAPH)));
    const { wrapper, router } = await mountLineage();
    // ELK layout is async: node buttons render only once positions resolve.
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-up-id"]').exists()).toBe(true));
    // 2026-11-25 lineage-controls (pin): a node body click drills into
    // the node's own lineage instead of opening the asset; the asset
    // path is now node name button -> detail drawer -> header link.
    // The vue-flow stub renders plain node buttons, never the card's
    // name button, so drive the graph->canvas contract the way
    // LineageCanvas.test.ts does: emit open-node on the graph.
    const graph = wrapper.findComponent(LineageGraph);
    graph.vm.$emit('open-node', {
      id: 'up-id',
      entityType: 'table',
      name: 'raw_orders',
      displayName: 'raw_orders',
      fullyQualifiedName: 'svc.db.schema.raw_orders',
      isCenter: false,
    });
    await flushPromises();
    await vi.waitFor(() =>
      expect(document.body.querySelector('[data-testid="lineage-entity-panel"]')).not.toBeNull(),
    );
    const link = document.body.querySelector(
      '[data-testid="entity-link"]',
    ) as HTMLElement | null;
    expect(link?.getAttribute('href')).toContain('/table/svc.db.schema.raw_orders');
    link?.click();
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.raw_orders',
    });
  });

  it('refetches when upstream depth changes', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(GRAPH),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountLineage();
    // The session default is the official store default 3, not the REST
    // default 1 — so the first lineage fetch already asks for depth 3, and
    // a decrement refetches at 2. (The permissions call precedes the
    // lineage fetch on this main, so locate the first lineage call.)
    const firstLineageCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/lineage/getLineage'),
    );
    expect(String(firstLineageCall?.[0])).toContain('upstreamDepth=3');
    // 2026-11-25 lineage-controls: the toolbar depth stepper is gone;
    // upstream depth is now set in the canvas config modal, which
    // teleports to document.body — so the input is read off the body
    // like LineageConfigModal.test.ts does (findComponent cannot see
    // teleported content by testid).
    await wrapper.get('[data-testid="lineage-config"]').trigger('click');
    // antd InputNumber forwards data-testid onto the inner <input>
    // itself (verified by probe), so there is no descendant input
    // to select — the testid element IS the input.
    await vi.waitFor(() =>
      expect(
        document.body.querySelector('[data-testid="lineage-config-upstream"]'),
      ).not.toBeNull(),
    );
    const upstreamInput = document.body.querySelector(
      '[data-testid="lineage-config-upstream"]',
    ) as HTMLInputElement;
    await new DOMWrapper(upstreamInput).setValue('2');
    const okButton = document.body.querySelector(
      '.ant-modal-footer .ant-btn-primary',
    ) as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    await vi.waitFor(() => {
      const lineageCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes('/api/v1/lineage/getLineage'),
      );
      expect(String(lineageCalls.at(-1)?.[0])).toContain('upstreamDepth=2');
    });
  });

  it('connect stub PUTs lineage edge then reloads GET', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/v1/permissions/')) {
        return jsonResponse({
          resource: 'table',
          permissions: [{ operation: 'EditLineage', access: 'allow' }],
        });
      }
      const method = init?.method ?? 'GET';
      if (method === 'PUT' && String(input).includes('/api/v1/lineage/')) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountLineage();
    // ELK layout is async: the connect stub renders only once nodes are laid out.
    await vi.waitFor(() => expect(wrapper.find('[data-testid="vue-flow-connect-stub"]').exists()).toBe(true));
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

  it('does not PUT a lineage edge when EditLineage is denied', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).includes('/api/v1/permissions/')) {
        return jsonResponse({
          resource: 'table',
          permissions: [{ operation: 'EditLineage', access: 'deny' }],
        });
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountLineage();
    // ELK layout is async: the connect stub renders only once nodes are laid out.
    await vi.waitFor(() => expect(wrapper.find('[data-testid="vue-flow-connect-stub"]').exists()).toBe(true));
    await wrapper.get('[data-testid="vue-flow-connect-stub"]').trigger('click');
    await flushPromises();
    expect(
      fetchMock.mock.calls.some(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PUT',
      ),
    ).toBe(false);
    expect(wrapper.text()).toContain('You do not have permission to edit lineage');
  });

  it('applies a custom date range through searchLineage start/end params', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(GRAPH),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountLineage();
    const firstLineageCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/lineage/getLineage'),
    );
    expect(String(firstLineageCall?.[0])).not.toContain('startTime=');
    // 2026-11-25 lineage-controls: the header now has several selects
    // (entity search first), so the time preset must be found inside
    // its own filter instead of taking the first ASelect on the page.
    const preset = wrapper
      .find('[data-testid="lineage-time-filter"]')
      .findComponent({ name: 'ASelect' });
    preset.vm.$emit('update:value', 'customRange');
    await flushPromises();
    await wrapper.get('[data-testid="lineage-time-custom-start"]').setValue('2026-01-05');
    await wrapper.get('[data-testid="lineage-time-custom-end"]').setValue('2026-01-07');
    await wrapper.get('[data-testid="lineage-time-custom-apply"]').trigger('click');
    await flushPromises();
    const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(lastUrl).toContain(`startTime=${new Date(2026, 0, 5).getTime()}`);
    expect(lastUrl).toContain(`endTime=${new Date(2026, 0, 8).getTime() - 1}`);
  });

  it('applies point-in-time through an end-only searchLineage param', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountLineage();
    // Same scoping as the custom-range test: the preset is the select
    // inside the time filter, not the first ASelect on the page.
    const preset = wrapper
      .find('[data-testid="lineage-time-filter"]')
      .findComponent({ name: 'ASelect' });
    preset.vm.$emit('update:value', 'pointInTime');
    await flushPromises();
    await wrapper.get('[data-testid="lineage-time-point"]').setValue('2026-01-07');
    await wrapper.get('[data-testid="lineage-time-point-apply"]').trigger('click');
    await flushPromises();
    const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(lastUrl).not.toContain('startTime=');
    expect(lastUrl).toContain(`endTime=${new Date(2026, 0, 8).getTime() - 1}`);
  });

});
