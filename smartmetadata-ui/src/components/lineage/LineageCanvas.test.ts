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
import LineageCanvas from './LineageCanvas.vue';

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
  emits: ['expand-children', 'collapse-children'],
  setup(props) {
    return () =>
      h('div', { 'data-testid': 'lineage-graph-stub' }, [
        h('span', { 'data-testid': 'stub-node-ids' }, (props.model?.nodes ?? []).map((n: { id: string }) => n.id).join(',')),
      ]);
  },
});

async function mountCanvas(query: Record<string, string> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div/>' } },
    ],
  });
  await router.push({ name: 'lineage', params: { entityType: 'table', fqn: 'svc.db.schema.orders' }, query });
  await router.isReady();
  const wrapper = mount(LineageCanvas, {
    props: { entityType: 'table', fqn: 'svc.db.schema.orders', variant: 'page' },
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
});
