/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { LineageSceneNode } from '@/lineage/scene';
import LineageMapNode, { type LineageMapNodeData } from './LineageMapNode.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());

function nodeData(partial: Partial<LineageMapNodeData> & { sceneNode: LineageSceneNode }): LineageMapNodeData {
  return {
    id: 'n1',
    entityType: 'table',
    name: 'orders',
    displayName: 'Orders',
    fullyQualifiedName: 'svc.db.orders',
    isCenter: false,
    serviceName: 'svc',
    pathLabel: 'svc / db',
    truncatedFqn: 'svc.db.orders',
    columns: [],
    drillable: false,
    ...partial,
  };
}

describe('LineageMapNode', () => {
  it('renders a container node with subtitle, count pill and drill affordance', async () => {
    const onDrill = vi.fn();
    const sceneNode: LineageSceneNode = {
      band: 'LAYER',
      id: 'svc1',
      label: 'svc1',
      levelKind: 'service',
      entityType: 'databaseService',
      fullyQualifiedName: 'svc1',
    };
    const wrapper = mount(LineageMapNode, {
      props: {
        data: nodeData({
          id: 'svc1',
          entityType: 'databaseService',
          name: 'svc1',
          displayName: 'Svc One',
          fullyQualifiedName: 'svc1',
          sceneNode,
          subtitle: 'Postgres · service',
          countLabel: '3 tables',
          drillable: true,
          onDrill,
        }),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.get('[data-testid="lineage-map-node-svc1"]').text()).toContain('Svc One');
    expect(wrapper.get('[data-testid="lineage-map-node-count"]').text()).toBe('3 tables');
    expect(wrapper.text()).toContain('Postgres · service');
    await wrapper.get('[data-testid="lineage-map-drill-svc1"]').trigger('click');
    expect(onDrill).toHaveBeenCalledWith(sceneNode);
  });

  it('de-emphasizes ghost container nodes and hides the drill button when not drillable', () => {
    const wrapper = mount(LineageMapNode, {
      props: {
        data: nodeData({
          id: 'svc1',
          entityType: 'databaseService',
          name: 'svc1',
          fullyQualifiedName: 'svc1',
          sceneNode: {
            band: 'LAYER',
            id: 'svc1',
            label: 'svc1',
            levelKind: 'service',
            isGhost: true,
          },
          drillable: false,
        }),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.get('[data-testid="lineage-map-node-svc1"]').classes()).toContain(
      'lineage-map-node--ghost',
    );
    expect(wrapper.find('[data-testid="lineage-map-drill-svc1"]').exists()).toBe(false);
  });

  it('renders an asset node through the shared LineageNode with its columns', () => {
    const wrapper = mount(LineageMapNode, {
      props: {
        data: nodeData({
          id: 'a',
          entityType: 'table',
          name: 'orders',
          displayName: 'Orders',
          fullyQualifiedName: 'svc.db.orders',
          columns: [{ fqn: 'svc.db.orders.id', name: 'id' }],
          expanded: true,
          sceneNode: {
            band: 'ASSET',
            id: 'a',
            label: 'orders',
            levelKind: 'table',
            entityType: 'table',
            fullyQualifiedName: 'svc.db.orders',
          },
        }),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.text()).toContain('Orders');
    expect(wrapper.find('[data-testid="lineage-column-svc.db.orders.id"]').exists()).toBe(true);
  });
});
