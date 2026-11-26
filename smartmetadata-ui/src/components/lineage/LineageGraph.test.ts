/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ELKLayout } from '@/lineage/elkLayout';
import { mapEntityLineage } from '@/lineage/graphModel';
import { createTestI18n } from '@/test/i18n';
import LineageGraph from './LineageGraph.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());
vi.mock('@vue-flow/minimap', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/minimap']());

const MODEL = mapEntityLineage({
  entity: {
    id: 'center-id',
    type: 'table',
    name: 'orders',
    displayName: 'Orders',
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
        columnsLineage: [{ fromColumns: ['svc.db.schema.raw_orders.id'], toColumn: 'svc.db.schema.orders.id' }],
      },
    },
  ],
  downstreamEdges: [],
});

describe('LineageGraph', () => {
  // The component lays out through the async ELK engine; warm the engine
  // once here so each mount pays a warm layout (~200 ms) instead of the
  // cold engine start (dynamic import + first layout, seconds on this VM).
  // The layout itself still runs for real on every mount; only the
  // one-time engine start moves out of the tests' wait budget.
  beforeAll(async () => {
    await ELKLayout.layoutGraph(
      [
        { id: 'warm-a', width: 260, height: 78 },
        { id: 'warm-b', width: 260, height: 78 },
      ],
      [{ id: 'warm-e', sources: ['warm-a'], targets: ['warm-b'] }],
    );
  });

  it('renders MiniMap, the zoom cluster and denser node fields from the mapped model', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    // Node positions arrive from the async ELK layout; the toolbar renders
    // immediately, the nodes only after the layout resolves.
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="lineage-node-center-id"]').exists()).toBe(true),
    );
    expect(wrapper.get('[data-testid="lineage-graph"]').classes()).toContain('lineage-graph--om-chrome');
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(true);
    // The find-node Select, Reset layout and fullscreen buttons are gone:
    // search lives in the canvas header, fullscreen is a URL param.
    expect(wrapper.find('[data-testid="lineage-find-node"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-fullscreen"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-reset-layout"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-controls"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-zoom-controls"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="zoom-level"]').text()).toBe('100%');
    expect(wrapper.get('[data-testid="lineage-connect-hint"]').text()).toContain('Drag from a node handle');
    expect(wrapper.get('[data-testid="lineage-node-center-id"]').attributes('data-path-label')).toBe(
      'svc / db / schema',
    );
    expect(wrapper.get('[data-testid="lineage-node-center-id"]').text()).toContain('Orders');
  });

  it('toggles the minimap from the zoom cluster', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(true);
    await wrapper.get('[data-testid="toggle-mind-map"]').trigger('click');
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(false);
    await wrapper.get('[data-testid="toggle-mind-map"]').trigger('click');
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('zooms and fits through the zoom cluster', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const flow = wrapper.findComponent({ name: 'VueFlow' });
    const zoomIn = flow.vm.zoomIn as unknown as ReturnType<typeof vi.fn>;
    const zoomOut = flow.vm.zoomOut as unknown as ReturnType<typeof vi.fn>;
    await wrapper.get('[data-testid="zoom-in"]').trigger('click');
    await wrapper.get('[data-testid="zoom-out"]').trigger('click');
    expect(zoomIn).toHaveBeenCalledTimes(1);
    expect(zoomOut).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('applies the fullscreen class from the prop (URL param), not a local toggle', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.get('[data-testid="lineage-graph"]').classes()).not.toContain('lineage-graph--fullscreen');
    await wrapper.setProps({ fullscreen: true });
    expect(wrapper.get('[data-testid="lineage-graph"]').classes()).toContain('lineage-graph--fullscreen');
    wrapper.unmount();
  });

  it('opens the drawer on node click and keeps the delete-key selection', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="lineage-node-center-id"]').exists()).toBe(true),
    );
    const flow = wrapper.findComponent({ name: 'VueFlow' });
    const flowNode = (flow.props('nodes') as { id: string; data: unknown }[]).find(
      (entry) => entry.id === 'center-id',
    );
    await flow.vm.$emit('node-click', { node: flowNode });
    const data = (flowNode as { data: unknown }).data;
    expect(wrapper.emitted('open-node')?.[0]?.[0]).toEqual(data);
    expect(wrapper.emitted('select-node')?.[0]?.[0]).toEqual(data);
    wrapper.unmount();
  });

  it('exposes centerOnNode for the canvas search', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="lineage-node-center-id"]').exists()).toBe(true),
    );
    const graph = wrapper.vm as unknown as { centerOnNode: (id: string) => boolean };
    expect(graph.centerOnNode('center-id')).toBe(true);
    expect(graph.centerOnNode('missing')).toBe(false);
    const flow = wrapper.findComponent({ name: 'VueFlow' });
    const setCenter = flow.vm.setCenter as unknown as ReturnType<typeof vi.fn>;
    expect(setCenter).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('renders the Layers panel bottom-left and hides the connect hint when editing is off', () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL, entityType: 'table', canEdit: false },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="lineage-layer-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-connect-hint"]').exists()).toBe(false);
    const editable = mount(LineageGraph, {
      props: { model: MODEL, canEdit: true },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(editable.find('[data-testid="lineage-connect-hint"]').exists()).toBe(true);
  });

  it('right-click on a node only suppresses the browser menu (pin onNodeContextMenu)', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const flow = wrapper.findComponent({ name: 'VueFlow' });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    await flow.vm.$emit('node-context-menu', { event, node: MODEL.nodes[0] });
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('select-node')).toBeUndefined();
    expect(wrapper.emitted('navigate')).toBeUndefined();
    // The template binding reaches the handler through a real DOM event too.
    // Nodes arrive from the async ELK layout; wait for the node to render
    // (same pattern as the first test) before driving the DOM event.
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="lineage-node-center-id"]').exists()).toBe(true),
    );
    await wrapper.get('[data-testid="lineage-node-center-id"]').trigger('contextmenu');
    expect(wrapper.emitted('select-node')).toBeUndefined();
    expect(wrapper.emitted('navigate')).toBeUndefined();
  });

  it('selects an edge on edge-click and offers its delete, emitting select-edge/delete-edge', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="lineage-delete-selected-edge"]').exists()).toBe(false);
    const flow = wrapper.findComponent({ name: 'VueFlow' });
    const edge = MODEL.edges[0];
    await flow.vm.$emit('edge-click', {
      edge: { id: edge.id, source: edge.source, target: edge.target, data: { isColumnEdge: false } },
    });
    expect(wrapper.emitted('select-edge')?.[0]?.[0]).toEqual({ edge, isColumnEdge: false });
    expect(wrapper.find('[data-testid="lineage-selected-edge"]').text()).toContain('Selected edge');
    await wrapper.find('[data-testid="lineage-delete-selected-edge"]').trigger('click');
    expect(wrapper.emitted('delete-edge')?.[0]?.[0]).toEqual({ edge, isColumnEdge: false });
  });

  it('holds edges back until the ELK layout resolves so nodes and edges reach Vue Flow together', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const flow = wrapper.findComponent({ name: 'VueFlow' });
    // Before the async ELK layout resolves there are no nodes; passing the
    // model edges then would make Vue Flow silently drop them (their
    // endpoints are not in the store) and never re-add them, because the
    // edges prop reference never changes afterwards — the first paint
    // showed 0 edges until some later recompute.
    expect(flow.props('nodes')).toEqual([]);
    expect(flow.props('edges')).toEqual([]);
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="lineage-node-center-id"]').exists()).toBe(true),
    );
    const edges = flow.props('edges') as { id: string }[];
    expect(edges).toHaveLength(1);
    expect(edges[0]?.id).toBe(MODEL.edges[0].id);
    wrapper.unmount();
  });

  it('selects a column edge as its parent edge plus the column pair', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const flow = wrapper.findComponent({ name: 'VueFlow' });
    const edge = MODEL.edges[0];
    await flow.vm.$emit('edge-click', {
      edge: {
        id: `col:${edge.id}:0:0`,
        source: edge.source,
        target: edge.target,
        data: {
          isColumnEdge: true,
          sourceHandle: 'svc.db.schema.raw_orders.id',
          targetHandle: 'svc.db.schema.orders.id',
        },
      },
    });
    expect(wrapper.emitted('select-edge')?.[0]?.[0]).toEqual({
      edge,
      isColumnEdge: true,
      sourceHandle: 'svc.db.schema.raw_orders.id',
      targetHandle: 'svc.db.schema.orders.id',
    });
  });

  it('inlines fill:none on entity and column edges so the PNG export keeps stroke-only paths', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL, forceColumnEdges: true },
      global: { plugins: [Antd, createTestI18n()] },
    });
    // Edges are gated on the async ELK layout (#352): until `positioned`
    // resolves the edges computed is []. Wait for the layout like the
    // other tests do, otherwise this reads an empty edge list.
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="lineage-node-center-id"]').exists()).toBe(true),
    );
    const flow = wrapper.findComponent({ name: 'VueFlow' });
    const edges = flow.props('edges') as {
      id: string;
      style?: Record<string, unknown>;
      labelBgStyle?: Record<string, unknown>;
      data?: { isColumnEdge?: boolean };
    }[];
    const entityEdge = edges.find((edge) => edge.data?.isColumnEdge === false);
    const columnEdge = edges.find((edge) => edge.data?.isColumnEdge === true);
    expect(entityEdge).toBeDefined();
    expect(columnEdge).toBeDefined();
    // html-to-image deep-copies the edges <svg> without computed styles:
    // without an inline fill the open smoothstep path renders as a solid
    // black fill in the exported PNG (repro: work/lineage-png-bug/REPORT.md).
    expect(entityEdge?.style).toMatchObject({ fill: 'none' });
    expect(columnEdge?.style).toMatchObject({ fill: 'none' });
    // The label background rect's fill is stylesheet-only too; without an
    // inline fill it renders black and hides the black label text.
    expect(entityEdge?.labelBgStyle).toMatchObject({ fill: 'white' });
    expect(columnEdge?.labelBgStyle).toMatchObject({ fill: 'white' });
    wrapper.unmount();
  });
});
