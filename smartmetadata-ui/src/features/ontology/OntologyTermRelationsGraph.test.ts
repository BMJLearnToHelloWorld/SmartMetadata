/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import OntologyTermRelationsGraph from './OntologyTermRelationsGraph.vue';

// The canvas is stubbed below (its G6 behaviour is covered by
// OntologyGraphCanvas.test.ts); the mock only keeps Vite from resolving
// the uninstalled @antv/g6 package for the real canvas module.
vi.mock('@antv/g6', () => ({
  Graph: class {},
}));

const exportPngSpy = vi.fn(async () => undefined);
const exportSvgSpy = vi.fn(async () => undefined);
const zoomInSpy = vi.fn();
const zoomOutSpy = vi.fn();
const fitViewSpy = vi.fn();

const CanvasStub = {
  name: 'OntologyGraphCanvas',
  props: ['graph', 'canEdit', 'highlight', 'scopeKey', 'selectedNodeId', 'selectedEdgeId', 'settings'],
  emits: ['select-node', 'node-dblclick', 'select-edge', 'canvas-click'],
  setup(_props: unknown, { expose }: { expose: (exposed: Record<string, unknown>) => void }) {
    expose({
      exportAsPng: exportPngSpy,
      exportAsSvg: exportSvgSpy,
      fitView: fitViewSpy,
      zoomIn: zoomInSpy,
      zoomOut: zoomOutSpy,
    });
  },
  template: `<div data-testid="stub-canvas">{{ (graph?.nodes ?? []).map((n) => n.id).join(',') }}</div>`,
};

const DataGraphStub = {
  name: 'OntologyDataGraph',
  props: ['data', 'selectedNodeId', 'limitMessage'],
  emits: ['load-more', 'pane-click', 'select-node'],
  template: `
    <div data-testid="stub-data-graph">
      <span data-testid="stub-data-nodes">{{ (data?.nodes ?? []).map((n) => n.id).join(',') }}</span>
      <button data-testid="stub-data-load-more" @click="$emit('load-more', 'a')">more</button>
    </div>`,
};

const SettingsStub = {
  name: 'GraphSettingsPanel',
  props: ['settings'],
  template: '<div data-testid="stub-settings" />',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('OntologyTermRelationsGraph (B-15 term scope)', () => {
  let listFails = false;

  function stubFetch(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaryTerms/assets/counts')) {
          return jsonResponse({ 'G.A': 4, 'G.B': 2 });
        }
        if (url.includes('/api/v1/glossaryTerms/byIds')) {
          return jsonResponse([
            { fullyQualifiedName: 'Other.External', id: 'x1', name: 'External', relatedTerms: [] },
          ]);
        }
        if (url.includes('/api/v1/glossaryTerms/a/assets')) {
          if (url.includes('offset=1')) {
            return jsonResponse({
              data: [{ fullyQualifiedName: 'svc.db.a2', id: 'a-asset-2', name: 'Second', type: 'table' }],
              paging: { total: 2 },
            });
          }
          return jsonResponse({
            data: [{ fullyQualifiedName: 'svc.db.a1', id: 'a-asset', name: 'First', type: 'table' }],
            paging: { total: 2 },
          });
        }
        if (url.includes('/assets')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          if (listFails) {
            return jsonResponse({ message: 'boom' }, 500);
          }
          return jsonResponse({
            data: [
              { fullyQualifiedName: 'G.Root', id: 'root', name: 'Root', relatedTerms: [] },
              {
                fullyQualifiedName: 'G.A',
                id: 'a',
                name: 'A',
                parent: { id: 'root', name: 'Root', type: 'glossaryTerm' },
                relatedTerms: [
                  { term: { id: 'b', name: 'B', type: 'glossaryTerm' }, relationType: 'relatedTo' },
                  { term: { id: 'x1', name: 'External', type: 'glossaryTerm' }, relationType: 'narrower' },
                ],
              },
              {
                fullyQualifiedName: 'G.B',
                id: 'b',
                name: 'B',
                relatedTerms: [{ term: { id: 'c', name: 'C', type: 'glossaryTerm' }, relationType: 'relatedTo' }],
              },
              { fullyQualifiedName: 'G.C', id: 'c', name: 'C', relatedTerms: [] },
            ],
            paging: {},
          });
        }
        return jsonResponse({}, 404);
      }),
    );
  }

  async function mountGraph(props: Record<string, unknown> = {}) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/terms/:id', name: 'governance-term', component: { template: '<div>term</div>' } },
        { path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
      ],
    });
    await router.push('/governance/terms/a');
    await router.isReady();
    const wrapper = mount(OntologyTermRelationsGraph, {
      props: {
        active: true,
        entityId: 'a',
        glossaryFqn: 'G',
        glossaryId: 'g1',
        scope: 'term',
        ...props,
      },
      global: {
        plugins: [router, Antd, createTestI18n()],
        stubs: { GraphSettingsPanel: SettingsStub, OntologyDataGraph: DataGraphStub, OntologyGraphCanvas: CanvasStub },
      },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    return { router, wrapper };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    listFails = false;
    vi.clearAllMocks();
  });

  it('loads nothing while the tab is inactive', async () => {
    stubFetch();
    const { wrapper } = await mountGraph({ active: false });
    const calls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('/api/v1/glossaryTerms'))).toBe(false);
    expect(wrapper.find('[data-testid="stub-canvas"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ontology-term-relations-loading"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the one-hop neighbourhood of the focal term, not the whole glossary', async () => {
    stubFetch();
    const { wrapper } = await mountGraph();
    expect(wrapper.find('[data-testid="stub-canvas"]').text()).toBe('root,a,b,x1');
    expect(wrapper.find('[data-testid="ontology-term-relations-stats"]').text()).toContain('4 terms');
    expect(wrapper.find('[data-testid="ontology-term-relations-stats"]').text()).toContain('3 relations');
    wrapper.unmount();
  });

  it('shows the no-term empty state without an entity id', async () => {
    stubFetch();
    const { wrapper } = await mountGraph({ entityId: '' });
    expect(wrapper.find('[data-testid="ontology-term-relations-no-term"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-canvas"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the empty state when the focal term has no relations in the graph', async () => {
    stubFetch();
    const { wrapper } = await mountGraph({ entityId: 'ghost' });
    expect(wrapper.find('[data-testid="ontology-term-relations-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the error state with retry when the glossary load fails', async () => {
    listFails = true;
    stubFetch();
    const { wrapper } = await mountGraph();
    expect(wrapper.find('[data-testid="ontology-term-relations-error"]').exists()).toBe(true);
    listFails = false;
    await wrapper.find('[data-testid="ontology-term-relations-retry"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="stub-canvas"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('filters to the search-empty state when nothing matches', async () => {
    stubFetch();
    const { wrapper } = await mountGraph();
    const search = wrapper.find('[data-testid="ontology-term-relations-search"]');
    await search.setValue('zzz-no-such-term');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-term-relations-search-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-canvas"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('loads no assets on entering data mode and pages them in per term on load-more (pin lazy load)', async () => {
    stubFetch();
    const { wrapper } = await mountGraph();
    await wrapper.find('[data-testid="ontology-graph-mode-data"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    // Lazy (pin loadAssetsForDataMode): entering data mode shows the term
    // cards with counts only — no asset is fetched until expanded.
    expect(wrapper.find('[data-testid="stub-data-graph"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-data-nodes"]').text()).toBe('root,a,b,x1');
    expect(wrapper.find('[data-testid="ontology-term-relations-data-legend"]').text()).toContain(
      'Semantic edge',
    );
    await wrapper.find('[data-testid="stub-data-load-more"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="stub-data-nodes"]').text()).toContain('a-asset');
    await wrapper.find('[data-testid="stub-data-load-more"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="stub-data-nodes"]').text()).toContain('a-asset-2');
    wrapper.unmount();
  });

  it('keeps the data graph after refresh in data mode (B-1)', async () => {
    stubFetch();
    const { wrapper } = await mountGraph();
    await wrapper.find('[data-testid="ontology-graph-mode-data"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="stub-data-graph"]').exists()).toBe(true);
    await wrapper.find('[data-testid="ontology-term-relations-refresh"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="stub-data-graph"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-data-nodes"]').text()).toBe('root,a,b,x1');
    wrapper.unmount();
  });

  it('keeps the load-error state after a failed refresh in data mode (B-1 failure path)', async () => {
    stubFetch();
    const { wrapper } = await mountGraph();
    await wrapper.find('[data-testid="ontology-graph-mode-data"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="stub-data-graph"]').exists()).toBe(true);
    // The reload fails: load() puts fullGraph back to null and sets
    // loadError, so onRefresh must skip re-entering data mode and the
    // load-error Alert must stay visible instead of a blank graph area.
    listFails = true;
    await wrapper.find('[data-testid="ontology-term-relations-refresh"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-term-relations-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-term-relations-retry"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-data-graph"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="stub-canvas"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('searches in data mode too: no-hit shows the search-empty state, a hit keeps the graph', async () => {
    stubFetch();
    const { wrapper } = await mountGraph();
    await wrapper.find('[data-testid="ontology-graph-mode-data"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    const search = wrapper.find('[data-testid="ontology-term-relations-search"]');
    expect(search.exists()).toBe(true);
    await search.setValue('zzz-no-such-term');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-term-relations-search-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-data-graph"]').exists()).toBe(false);
    // The legend lives at toolbar layer (pin renderDataModeEdgeLegend), so
    // the search-empty state hides the graph but not the legend.
    expect(wrapper.find('[data-testid="ontology-term-relations-data-legend"]').exists()).toBe(true);
    await search.setValue('B');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-term-relations-search-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="stub-data-graph"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('exports through the canvas handle and opens a neighbour in a new tab on double-click', async () => {
    stubFetch();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { router, wrapper } = await mountGraph();
    await wrapper.find('[data-testid="ontology-term-relations-export-png"]').trigger('click');
    await wrapper.find('[data-testid="ontology-term-relations-export-svg"]').trigger('click');
    expect(exportPngSpy).toHaveBeenCalledTimes(1);
    expect(exportSvgSpy).toHaveBeenCalledTimes(1);
    await wrapper.find('[data-testid="ontology-term-relations-zoom-in"]').trigger('click');
    expect(zoomInSpy).toHaveBeenCalledTimes(1);
    const canvas = wrapper.findComponent(CanvasStub);
    await canvas.vm.$emit('node-dblclick', 'b');
    await flushPromises();
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/governance/terms/b'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(router.currentRoute.value.params).toMatchObject({ id: 'a' });
    await canvas.vm.$emit('node-dblclick', 'a');
    await flushPromises();
    expect(openSpy).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
