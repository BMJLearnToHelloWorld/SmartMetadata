/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h } from 'vue';
import { createTestI18n } from '@/test/i18n';
import { useLineageStore } from '@/stores/lineage';
import { CSV_JOBS_REFRESH_EVENT } from '@/api/csvJobs';
import DetailTabs from '@/components/shared/DetailTabs.vue';
import AddLineagePopover from './AddLineagePopover.vue';
import LineageCanvas from './LineageCanvas.vue';
import LineageNodeDeleteModal from './LineageNodeDeleteModal.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());
vi.mock('@vue-flow/minimap', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/minimap']());

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
      paging: { entityUpstreamCount: 1, entityDownstreamCount: 0 },
    },
    'svc.db.schema.raw_orders': {
      entity: {
        id: 'up-id',
        type: 'table',
        name: 'raw_orders',
        fullyQualifiedName: 'svc.db.schema.raw_orders',
      },
      nodeDepth: 1,
      paging: { entityUpstreamCount: 1, entityDownstreamCount: 0 },
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

const EXPAND_UP = {
  nodes: {
    'svc.db.schema.raw_orders': {
      entity: {
        id: 'up-id',
        type: 'table',
        name: 'raw_orders',
        fullyQualifiedName: 'svc.db.schema.raw_orders',
      },
      nodeDepth: 0,
    },
    'svc.db.schema.grand': {
      entity: {
        id: 'grand-id',
        type: 'table',
        name: 'grand',
        fullyQualifiedName: 'svc.db.schema.grand',
      },
      nodeDepth: 1,
    },
  },
  upstreamEdges: {
    e1: {
      fromEntity: { id: 'grand-id', fullyQualifiedName: 'svc.db.schema.grand', type: 'table' },
      toEntity: { id: 'up-id', fullyQualifiedName: 'svc.db.schema.raw_orders', type: 'table' },
    },
  },
  downstreamEdges: {},
};

// The graph is stubbed: the canvas logic (fetch shape, merge, collapse,
// DQ, time URL) is what this file verifies, and the stub re-emits the
// expand/collapse intents the real graph would raise from node buttons.
const LineageGraphStub = defineComponent({
  name: 'LineageGraphStub',
  props: { model: { type: Object, default: () => null } },
  emits: [
    'expand-children',
    'collapse-children',
    'connect',
    'select-node',
    'select-edge',
    'edit-lineage',
    'delete-node',
    'delete-edge',
    'change-active-layer',
    'change-platform-view',
  ],
  setup(props, { emit }) {
    return () =>
      h('div', { 'data-testid': 'lineage-graph-stub' }, [
        h('span', { 'data-testid': 'stub-node-ids' }, (props.model?.nodes ?? []).map((n: { id: string }) => n.id).join(',')),
        h(
          'button',
          {
            'data-testid': 'stub-connect',
            onClick: () =>
              emit('connect', {
                from: { id: 'up-id', entityType: 'table', fullyQualifiedName: 'svc.db.schema.raw_orders' },
                to: { id: 'center-id', entityType: 'table', fullyQualifiedName: 'svc.db.schema.orders' },
              }),
          },
          'connect',
        ),
      ]);
  },
});

async function mountCanvas(
  query: Record<string, string> = {},
  propsOverride: Record<string, unknown> = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div/>' } },
      // The impact table's name cells link to the asset detail page.
      { path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div/>' } },
    ],
  });
  await router.push({ name: 'lineage', params: { entityType: 'table', fqn: 'svc.db.schema.orders' }, query });
  await router.isReady();
  const wrapper = mount(LineageCanvas, {
    props: { entityType: 'table', fqn: 'svc.db.schema.orders', variant: 'page', ...propsOverride },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: { LineageGraph: LineageGraphStub },
    },
  });
  await flushPromises();
  return { wrapper, router, pinia };
}

function fetchUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe('LineageCanvas (L2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('seeds the time filter from lineageStartTime/lineageEndTime URL params', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const start = new Date(2026, 0, 5).getTime();
    const end = new Date(2026, 0, 8).getTime() - 1;
    await mountCanvas({ lineageStartTime: String(start), lineageEndTime: String(end) });
    const firstUrl = fetchUrls(fetchMock)[0];
    expect(firstUrl).toContain(`startTime=${start}`);
    expect(firstUrl).toContain(`endTime=${end}`);
  });

  it('writes the resolved time range back to the URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { router } = await mountCanvas();
    expect(router.currentRoute.value.query.lineageStartTime).toBeUndefined();
    useLineageStore().update({
      timePreset: 'customRange',
      customStartDate: '2026-01-05',
      customEndDate: '2026-01-07',
    });
    await flushPromises();
    expect(router.currentRoute.value.query.lineageStartTime).toBe(String(new Date(2026, 0, 5).getTime()));
    expect(router.currentRoute.value.query.lineageEndTime).toBe(String(new Date(2026, 0, 8).getTime() - 1));
  });

  it('sends quick filters as a query_filter JSON term query', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    await mountCanvas();
    useLineageStore().setQuickFilters([{ key: 'tag', values: ['PII.Sensitive'] }]);
    await flushPromises();
    const lastUrl = fetchUrls(fetchMock).at(-1) ?? '';
    expect(lastUrl).toContain('query_filter=');
    const params = new URL(lastUrl, 'http://test').searchParams;
    expect(JSON.parse(params.get('query_filter') ?? '')).toEqual({
      query: {
        bool: {
          must: [{ bool: { should: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } }],
        },
      },
    });
  });

  it('fetches DQ lineage only with the DataObservability layer and survives its failure', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('getDataQualityLineage')) {
        return jsonResponse({ nodes: [{ id: 'up-id', fullyQualifiedName: 'svc.db.schema.raw_orders' }], edges: [] });
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    expect(fetchUrls(fetchMock).some((url) => url.includes('getDataQualityLineage'))).toBe(false);
    useLineageStore().update({ layer: 'DataObservability' });
    await flushPromises();
    const dqUrl = fetchUrls(fetchMock).find((url) => url.includes('getDataQualityLineage'));
    expect(dqUrl).toContain('fqn=svc.db.schema.orders');
    expect(dqUrl).toContain('upstreamDepth=1');
    expect(wrapper.find('[data-testid="lineage-graph-stub"]').exists()).toBe(true);
  });

  it('loads one directional level on expand and removes it on collapse', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/getLineage/Upstream')) {
        return jsonResponse(EXPAND_UP);
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    const stub = wrapper.findComponent(LineageGraphStub);
    expect(wrapper.find('[data-testid="stub-node-ids"]').text()).toContain('up-id');
    expect(wrapper.find('[data-testid="stub-node-ids"]').text()).not.toContain('grand-id');
    stub.vm.$emit('expand-children', {
      node: { id: 'up-id', entityType: 'table', fullyQualifiedName: 'svc.db.schema.raw_orders' },
      direction: 'upstream',
    });
    await flushPromises();
    const expandUrl = fetchUrls(fetchMock).find((url) => url.includes('/getLineage/Upstream'));
    expect(expandUrl).toContain('upstreamDepth=1');
    expect(expandUrl).toContain('downstreamDepth=0');
    expect(wrapper.find('[data-testid="stub-node-ids"]').text()).toContain('grand-id');
    stub.vm.$emit('collapse-children', {
      node: { id: 'up-id', entityType: 'table', fullyQualifiedName: 'svc.db.schema.raw_orders' },
      direction: 'upstream',
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="stub-node-ids"]').text()).not.toContain('grand-id');
  });

  it('renders the server-backed impact table for ?mode=impact_analysis', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas({ mode: 'impact_analysis' });
    // The diagram is hidden; the impact tab mounts the LineageTable,
    // which fetches the count endpoint for its own rows.
    expect(wrapper.find('[data-testid="lineage-graph-stub"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-card-table"]').exists()).toBe(true);
    expect(fetchUrls(fetchMock).some((url) => url.includes('getLineageByEntityCount'))).toBe(true);
  });

  it('renders the diagram by default when no mode is given', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    expect(wrapper.find('[data-testid="lineage-graph-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-card-table"]').exists()).toBe(false);
  });
});

const UP_NODE = {
  id: 'up-id',
  entityType: 'table',
  name: 'raw_orders',
  displayName: 'raw_orders',
  fullyQualifiedName: 'svc.db.schema.raw_orders',
  isCenter: false,
};
const CENTER_NODE = {
  id: 'center-id',
  entityType: 'table',
  name: 'orders',
  displayName: 'orders',
  fullyQualifiedName: 'svc.db.schema.orders',
  isCenter: true,
};

/** The delete modal teleports to document.body; earlier tests' portals may linger, so read the last match. */
function bodyEl(testId: string): HTMLElement {
  const all = [...document.body.querySelectorAll(`[data-testid="${testId}"]`)];
  const el = all.at(-1);
  if (!el) {
    throw new Error(`missing [data-testid="${testId}"]`);
  }
  return el as HTMLElement;
}

interface FetchCall {
  url: string;
  method: string;
  body: string;
}

function fetchCalls(fetchMock: ReturnType<typeof vi.fn>): FetchCall[] {
  return fetchMock.mock.calls.map((call) => ({
    url: String(call[0]),
    method: String((call[1] as { method?: string } | undefined)?.method ?? 'GET'),
    body: String((call[1] as { body?: string } | undefined)?.body ?? ''),
  }));
}

describe('LineageCanvas (L3)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('deletes a node via the delete-node intent: DELETEs every connected edge, then refetches', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    const stub = wrapper.findComponent(LineageGraphStub);
    stub.vm.$emit('delete-node', UP_NODE);
    await flushPromises();
    expect(wrapper.findComponent(LineageNodeDeleteModal).exists()).toBe(true);
    expect(document.body.innerHTML).toContain('Remove raw_orders from lineage');
    const searchesBefore = fetchCalls(fetchMock).filter((call) => call.url.includes('/lineage/getLineage')).length;
    bodyEl('delete-node-confirm').click();
    await flushPromises();
    const deletes = fetchCalls(fetchMock).filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toContain('/v1/lineage/table/name/svc.db.schema.raw_orders/table/name/svc.db.schema.orders');
    expect(fetchCalls(fetchMock).filter((call) => call.url.includes('/lineage/getLineage')).length).toBeGreaterThan(searchesBefore);
    expect(wrapper.findComponent(LineageNodeDeleteModal).exists()).toBe(false);
  });

  it('deletes an entity edge via the delete-edge intent', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    const stub = wrapper.findComponent(LineageGraphStub);
    stub.vm.$emit('delete-edge', { edge: { id: 'e1', source: 'up-id', target: 'center-id' }, isColumnEdge: false });
    await flushPromises();
    bodyEl('delete-node-confirm').click();
    await flushPromises();
    const deletes = fetchCalls(fetchMock).filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toContain('/v1/lineage/table/name/svc.db.schema.raw_orders/table/name/svc.db.schema.orders');
  });

  it('removes a column mapping by re-PUTting the edge without the pair', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('getLineageEdge')) {
        return jsonResponse({
          edge: {
            columnsLineage: [
              { fromColumns: ['svc.db.schema.raw_orders.id'], toColumn: 'svc.db.schema.orders.id' },
            ],
          },
        });
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    const stub = wrapper.findComponent(LineageGraphStub);
    stub.vm.$emit('delete-edge', {
      edge: { id: 'e1', source: 'up-id', target: 'center-id' },
      isColumnEdge: true,
      sourceHandle: 'svc.db.schema.raw_orders.id',
      targetHandle: 'svc.db.schema.orders.id',
    });
    await flushPromises();
    bodyEl('delete-node-confirm').click();
    await flushPromises();
    const puts = fetchCalls(fetchMock).filter((call) => call.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toContain('/v1/lineage/table/name/svc.db.schema.raw_orders/table/name/svc.db.schema.orders');
    expect(JSON.parse(puts[0].body)).not.toHaveProperty('columnsLineage');
    expect(fetchCalls(fetchMock).some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('opens the node delete modal on Delete for a selected non-center node, never for the center', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    const stub = wrapper.findComponent(LineageGraphStub);
    stub.vm.$emit('select-node', CENTER_NODE);
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await flushPromises();
    expect(wrapper.findComponent(LineageNodeDeleteModal).exists()).toBe(false);
    stub.vm.$emit('select-node', UP_NODE);
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await flushPromises();
    expect(wrapper.findComponent(LineageNodeDeleteModal).exists()).toBe(true);
  });

  it('gates connect and delete on hasEditAccess=false: no PUT, no DELETE', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas({}, { hasEditAccess: false });
    const stub = wrapper.findComponent(LineageGraphStub);
    stub.vm.$emit('connect', { from: UP_NODE, to: CENTER_NODE });
    await flushPromises();
    stub.vm.$emit('delete-node', UP_NODE);
    await flushPromises();
    bodyEl('delete-node-confirm').click();
    await flushPromises();
    expect(fetchCalls(fetchMock).some((call) => call.method === 'PUT')).toBe(false);
    expect(fetchCalls(fetchMock).some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('re-centers the fetch on the service for a Service platform view', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/tables/name/')) {
        return jsonResponse({ service: { fullyQualifiedName: 'svc', type: 'databaseService' } });
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    await mountCanvas();
    useLineageStore().setPlatformView('Service');
    await flushPromises();
    const searches = fetchCalls(fetchMock).filter((call) => call.url.includes('/lineage/getLineage'));
    expect(searches.at(-1)?.url).toContain('fqn=svc');
    expect(searches.at(-1)?.url).toContain('type=databaseService');
  });

  it('reverts an unresolvable platform view to None instead of fetching the wrong entity', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    await mountCanvas();
    const searchesBefore = fetchCalls(fetchMock).filter((call) => call.url.includes('/lineage/getLineage')).length;
    useLineageStore().setPlatformView('Service');
    await flushPromises();
    expect(useLineageStore().platformView).toBe('None');
    expect(fetchCalls(fetchMock).filter((call) => call.url.includes('/lineage/getLineage')).length).toBe(searchesBefore + 1);
    expect(fetchCalls(fetchMock).every((call) => !call.url.includes('fqn=svc&'))).toBe(true);
  });

  it('drives the DataObservability overlay from the Layers panel change', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('getDataQualityLineage')) {
        return jsonResponse({ nodes: [{ id: 'up-id', fullyQualifiedName: 'svc.db.schema.raw_orders' }], edges: [] });
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    const stub = wrapper.findComponent(LineageGraphStub);
    stub.vm.$emit('change-active-layer', ['DataObservability']);
    await flushPromises();
    expect(useLineageStore().activeLayer).toContain('DataObservability');
    expect(fetchCalls(fetchMock).some((call) => call.url.includes('getDataQualityLineage'))).toBe(true);
  });

  it('exports CSV asynchronously and notifies the CSV jobs tray', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('exportAsync')) {
        return jsonResponse({ jobId: 'job-1', message: 'started' });
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    const refreshed = vi.fn();
    window.addEventListener(CSV_JOBS_REFRESH_EVENT, refreshed);
    try {
      await wrapper.find('[data-testid="lineage-export-csv"]').trigger('click');
      await flushPromises();
    } finally {
      window.removeEventListener(CSV_JOBS_REFRESH_EVENT, refreshed);
    }
    const exports = fetchCalls(fetchMock).filter((call) => call.url.includes('exportAsync'));
    expect(exports).toHaveLength(1);
    expect(exports[0].url).toContain('fqn=svc.db.schema.orders');
    expect(refreshed).toHaveBeenCalled();
  });

  it('saves a new edge from the add-lineage popover submit (404 probe → new PUT)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('getLineageEdge')) {
        return jsonResponse({}, 404);
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas();
    const stub = wrapper.findComponent(LineageGraphStub);
    stub.vm.$emit('edit-lineage', { node: UP_NODE, direction: 'downstream' });
    await flushPromises();
    const popover = wrapper.findComponent(AddLineagePopover);
    expect(popover.exists()).toBe(true);
    popover.vm.$emit('submit', {
      entity: { entityType: 'table', fqn: 'svc.db.schema.customers', id: 'cust-id' },
    });
    await flushPromises();
    const puts = fetchCalls(fetchMock).filter((call) => call.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toContain('/v1/lineage/table/name/svc.db.schema.raw_orders/table/name/svc.db.schema.customers');
    expect(JSON.parse(puts[0].body)).toEqual({ source: 'Manual' });
    expect(popover.exists()).toBe(false);
  });
});

describe('LineageCanvas (L6)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('tab variant opens the impact view from ?mode=impact_analysis', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas({ mode: 'impact_analysis' }, { variant: 'tab' });
    expect(wrapper.find('[data-testid="lineage-card-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-graph-stub"]').exists()).toBe(false);
  });

  it('tab variant opens the diagram without the mode param', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas({}, { variant: 'tab' });
    expect(wrapper.find('[data-testid="lineage-graph-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-card-table"]').exists()).toBe(false);
  });

  it('tab variant writes ?mode=impact_analysis when the impact view is picked, and strips it on diagram', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper, router } = await mountCanvas({}, { variant: 'tab' });
    expect(router.currentRoute.value.query.mode).toBeUndefined();
    wrapper.findComponent(DetailTabs).vm.$emit('change', 'impact');
    await flushPromises();
    expect(router.currentRoute.value.query.mode).toBe('impact_analysis');
    expect(wrapper.find('[data-testid="lineage-card-table"]').exists()).toBe(true);
    wrapper.findComponent(DetailTabs).vm.$emit('change', 'diagram');
    await flushPromises();
    expect(router.currentRoute.value.query.mode).toBeUndefined();
    expect(wrapper.find('[data-testid="lineage-graph-stub"]').exists()).toBe(true);
  });

  it('tab variant follows an external navigation out of impact mode', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper, router } = await mountCanvas({ mode: 'impact_analysis' }, { variant: 'tab' });
    expect(wrapper.find('[data-testid="lineage-card-table"]').exists()).toBe(true);
    await router.replace({ query: {} });
    await flushPromises();
    expect(wrapper.find('[data-testid="lineage-graph-stub"]').exists()).toBe(true);
  });

  it('page variant reads the mode param and writes it back like the tab', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    // Pin reads ?mode in the shared Lineage provider (Lineage.tsx:687,930)
    // with no page/tab split, so the page opens the impact table too.
    const { wrapper, router } = await mountCanvas({ mode: 'impact_analysis' });
    expect(wrapper.find('[data-testid="lineage-card-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-graph-stub"]').exists()).toBe(false);
    // And the shared controls write it back (CustomControls:259-270), so
    // picking the impact view in the page writes the param as well.
    await router.replace({ query: {} });
    await flushPromises();
    wrapper.findComponent(DetailTabs).vm.$emit('change', 'impact');
    await flushPromises();
    expect(wrapper.find('[data-testid="lineage-card-table"]').exists()).toBe(true);
    expect(router.currentRoute.value.query.mode).toBe('impact_analysis');
  });

  it('does not PUT a lineage edge when hasEditAccess is false', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas({}, { variant: 'tab', hasEditAccess: false });
    await wrapper.get('[data-testid="stub-connect"]').trigger('click');
    await flushPromises();
    expect(
      fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'PUT'),
    ).toBe(false);
    expect(wrapper.text()).toContain('You do not have permission to edit lineage');
  });

  it('PUTs a lineage edge then reloads when hasEditAccess is true', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') {
        return jsonResponse({ ok: true });
      }
      return jsonResponse(GRAPH);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountCanvas({}, { variant: 'tab', hasEditAccess: true });
    await wrapper.get('[data-testid="stub-connect"]').trigger('click');
    await flushPromises();
    const putCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === 'PUT',
    );
    expect(putCall).toBeTruthy();
    expect(String(putCall?.[0])).toContain(
      '/api/v1/lineage/table/name/svc.db.schema.raw_orders/table/name/svc.db.schema.orders',
    );
    expect(JSON.parse(String((putCall?.[1] as RequestInit).body))).toEqual({ source: 'Manual' });
  });
});
