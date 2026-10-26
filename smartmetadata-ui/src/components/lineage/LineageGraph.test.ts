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
import { describe, expect, it, vi } from 'vitest';
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
  it('renders MiniMap, node search, and denser node fields from the mapped model', () => {
    const wrapper = mount(LineageGraph, {
      props: { model: MODEL },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.get('[data-testid="lineage-graph"]').classes()).toContain('lineage-graph--om-chrome');
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-find-node"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-fullscreen"]').exists()).toBe(true);
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
});
