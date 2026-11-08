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
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import OntologyGraphCanvas from './OntologyGraphCanvas.vue';

type G6Instance = {
  options: Record<string, unknown>;
  handlers: Record<string, (event: { target?: { id?: string } }) => void>;
  data: unknown;
  setData: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  fitView: ReturnType<typeof vi.fn>;
  zoomBy: ReturnType<typeof vi.fn>;
  zoomTo: ReturnType<typeof vi.fn>;
  getZoom: ReturnType<typeof vi.fn>;
  getCanvasCenter: ReturnType<typeof vi.fn>;
  layout: ReturnType<typeof vi.fn>;
  focusElement: ReturnType<typeof vi.fn>;
  getNodeData: ReturnType<typeof vi.fn>;
  updateNodeData: ReturnType<typeof vi.fn>;
  updateEdgeData: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
};

const g6State = vi.hoisted(() => ({
  instances: [] as G6Instance[],
  zoom: 1,
  nodePositions: [
    { id: 'a', style: { x: 10, y: 20 } },
    { id: 'b', style: { x: 30, y: 40 } },
  ] as Array<{ id: string; style: { x: number; y: number } }>,
}));

vi.mock('@antv/g6', () => ({
  Graph: class {
    options: Record<string, unknown>;
    handlers: Record<string, (event: { target?: { id?: string } }) => void> = {};
    data: unknown;
    setData = vi.fn((data: unknown) => {
      this.data = data;
    });
    render = vi.fn(async () => undefined);
    destroy = vi.fn(() => undefined);
    fitView = vi.fn(async () => undefined);
    zoomBy = vi.fn(async () => undefined);
    zoomTo = vi.fn(async () => undefined);
    getZoom = vi.fn(() => g6State.zoom);
    getCanvasCenter = vi.fn(() => ({ x: 450, y: 260 }));
    layout = vi.fn(async () => undefined);
    focusElement = vi.fn(async () => undefined);
    getNodeData = vi.fn(() => g6State.nodePositions);
    updateNodeData = vi.fn(() => undefined);
    updateEdgeData = vi.fn(() => undefined);
    setSize = vi.fn(() => undefined);
    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.data = options.data;
      g6State.instances.push(this as unknown as G6Instance);
    }
    on(event: string, handler: (event: { target?: { id?: string } }) => void): void {
      this.handlers[event] = handler;
    }
  },
}));

const graph = {
  nodes: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  edges: [],
};

const graphWithEdge = {
  nodes: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  edges: [{ id: 'a->b:subClassOf', label: 'isA', source: 'a', target: 'b', relationType: 'subClassOf' }],
};

function resetG6(): void {
  g6State.instances.length = 0;
  g6State.zoom = 1;
}

async function mountCanvas(props: Record<string, unknown>, zoom = 1) {
  resetG6();
  g6State.zoom = zoom;
  const wrapper = mount(OntologyGraphCanvas, {
    props: { graph, canEdit: false, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  expect(g6State.instances).toHaveLength(1);
  return { wrapper, instance: g6State.instances[0]! };
}

describe('OntologyGraphCanvas', () => {
  it('builds a G6 graph with drag behaviours and confirms a relation via clicks', async () => {
    const { wrapper, instance } = await mountCanvas({ canEdit: true });
    expect(instance.options.behaviors).toEqual(['drag-canvas', 'zoom-canvas', 'drag-element']);
    instance.handlers['node:click']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-armed"]').exists()).toBe(true);
    instance.handlers['node:click']?.({ target: { id: 'b' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-pending"]').exists()).toBe(true);
    await wrapper.find('[data-testid="ontology-graph-confirm"]').trigger('click');
    expect(wrapper.emitted('create-relation')).toEqual([
      [{ fromId: 'a', toId: 'b', relationType: 'subClassOf' }],
    ]);
  });

  it('does not arm nodes when read-only', async () => {
    const { wrapper, instance } = await mountCanvas({ canEdit: false });
    instance.handlers['node:click']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-armed"]').exists()).toBe(false);
    expect(wrapper.emitted('create-relation')).toBeUndefined();
  });

  it('arms after a false -> true edit-mode flip (ADR:2026-11-08-ontology-browser-canvas-stage-1)', async () => {
    const { wrapper, instance } = await mountCanvas({ canEdit: false });
    instance.handlers['node:click']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-armed"]').exists()).toBe(false);
    expect(wrapper.emitted('select-node')).toEqual([['a']]);
    await wrapper.setProps({ canEdit: true });
    await wrapper.vm.$nextTick();
    // The read-only selection is cleared on the flip; the click now arms.
    expect(wrapper.find('[data-testid="ontology-graph-selected"]').exists()).toBe(false);
    instance.handlers['node:click']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-armed"]').exists()).toBe(true);
  });

  it('resets the arm when edit mode flips true -> false', async () => {
    const { wrapper, instance } = await mountCanvas({ canEdit: true });
    instance.handlers['node:click']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-armed"]').exists()).toBe(true);
    await wrapper.setProps({ canEdit: false });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-armed"]').exists()).toBe(false);
    instance.handlers['node:click']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('select-node')).toEqual([['a']]);
  });

  it('read-only clicks select, double-click opens detail, edge click selects the edge, canvas click clears', async () => {
    const { wrapper, instance } = await mountCanvas({ canEdit: false, graph: graphWithEdge });
    instance.handlers['node:click']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('select-node')).toEqual([['a']]);
    expect(wrapper.emitted('select-edge')).toEqual([[null]]);
    expect(wrapper.find('[data-testid="ontology-graph-selected"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-graph-selected"]').text()).toContain('A');
    instance.handlers['node:dblclick']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('node-dblclick')).toEqual([['a']]);
    instance.handlers['edge:click']?.({ target: { id: 'a->b:subClassOf' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('select-edge')).toEqual([[null], [graphWithEdge.edges[0]]]);
    expect(wrapper.emitted('select-node')).toEqual([['a'], [null]]);
    instance.handlers['canvas:click']?.({});
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('canvas-click')).toEqual([[]]);
    expect(wrapper.find('[data-testid="ontology-graph-selected"]').exists()).toBe(false);
    expect(wrapper.emitted('select-node')).toEqual([['a'], [null], [null]]);
  });

  it('clamps fitView zoom to <= 1 (official fitViewWithMinZoom)', async () => {
    const { instance } = await mountCanvas({ canEdit: false }, 2);
    expect(instance.fitView).toHaveBeenCalledTimes(1);
    expect(instance.zoomTo).toHaveBeenCalledWith(1, { duration: 0 }, { x: 450, y: 260 });
  });

  it('does not clamp when the fitted zoom is already <= 1', async () => {
    const { instance } = await mountCanvas({ canEdit: false }, 0.5);
    expect(instance.zoomTo).not.toHaveBeenCalled();
  });

  it('groups nodes into combos by owning ontology', async () => {
    const { instance } = await mountCanvas({
      canEdit: false,
      graph: {
        nodes: [
          { id: 'a', label: 'A', ontologyId: 'o1', group: 'Sales' },
          { id: 'b', label: 'B', ontologyId: 'o1', group: 'Sales' },
          { id: 'c', label: 'C', ontologyId: 'o2', group: 'Shop' },
        ],
        edges: [],
      },
    });
    const data = instance.data as {
      combos: Array<{ id: string; data: { label: string; colorIndex: number } }>;
      nodes: Array<{ id: string; combo?: string }>;
    };
    expect(data.combos).toEqual([
      { data: { colorIndex: 0, label: 'Sales' }, id: 'ontology:o1' },
      { data: { colorIndex: 1, label: 'Shop' }, id: 'ontology:o2' },
    ]);
    expect(data.nodes.map((node) => node.combo)).toEqual(['ontology:o1', 'ontology:o1', 'ontology:o2']);
  });

  it('exposes the handle: zoom, layout, focus, and node positions', async () => {
    const { wrapper, instance } = await mountCanvas({ canEdit: false });
    const exposed = wrapper.vm as unknown as {
      zoomIn: () => unknown;
      zoomOut: () => unknown;
      runLayout: () => unknown;
      focusNode: (id: string) => unknown;
      getNodePositions: () => Record<string, { x: number; y: number }>;
    };
    await exposed.zoomIn();
    expect(instance.zoomBy).toHaveBeenCalledWith(1.2, { duration: 100 });
    await exposed.zoomOut();
    expect(instance.zoomBy).toHaveBeenCalledWith(0.8, { duration: 100 });
    await exposed.runLayout();
    expect(instance.layout).toHaveBeenCalledTimes(1);
    await exposed.focusNode('a');
    expect(instance.focusElement).toHaveBeenCalledWith('a', { duration: 0 });
    expect(exposed.getNodePositions()).toEqual({ a: { x: 10, y: 20 }, b: { x: 30, y: 40 } });
  });

  it('keeps node positions on a same-scope refresh and re-fits on a scope change', async () => {
    const { wrapper, instance } = await mountCanvas({ canEdit: false, scopeKey: 'ontology:all' });
    instance.fitView.mockClear();
    instance.updateNodeData.mockClear();
    await wrapper.setProps({
      graph: {
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
        ],
        edges: [],
      },
    });
    await flushPromises();
    expect(instance.fitView).not.toHaveBeenCalled();
    const positionUpdates = instance.updateNodeData.mock.calls.flatMap((call) => call[0] as Array<Record<string, unknown>>);
    expect(positionUpdates).toContainEqual({ id: 'a', style: { x: 10, y: 20 } });
    expect(positionUpdates).toContainEqual({ id: 'b', style: { x: 30, y: 40 } });
    await wrapper.setProps({ scopeKey: 'ontology:o1' });
    await flushPromises();
    expect(instance.fitView).toHaveBeenCalledTimes(1);
  });
});
