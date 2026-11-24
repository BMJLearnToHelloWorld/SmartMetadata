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

  it('renders MiniMap, node search, and denser node fields from the mapped model', async () => {
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
    expect(wrapper.find('[data-testid="lineage-find-node"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="lineage-connect-hint"]').text()).toContain('Drag from a node handle');
    expect(wrapper.find('[data-testid="lineage-fullscreen"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="lineage-fullscreen"]').attributes('aria-label')).toBe(
      'Expand the canvas',
    );
    expect(wrapper.get('[data-testid="lineage-reset-layout"]').attributes('aria-label')).toBe(
      'Reset node positions',
    );
    expect(wrapper.get('[data-testid="lineage-node-center-id"]').attributes('data-path-label')).toBe(
      'svc / db / schema',
    );
    expect(wrapper.get('[data-testid="lineage-node-center-id"]').text()).toContain('Orders');
  });

  it('toggles fullscreen class without leaving the canvas', async () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.get('[data-testid="lineage-graph"]').classes()).not.toContain('lineage-graph--fullscreen');
    await wrapper.get('[data-testid="lineage-fullscreen"]').trigger('click');
    expect(wrapper.get('[data-testid="lineage-graph"]').classes()).toContain('lineage-graph--fullscreen');
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
});
