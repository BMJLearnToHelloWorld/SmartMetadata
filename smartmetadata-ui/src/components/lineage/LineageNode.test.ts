/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LineageNode from './LineageNode.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());

function nodeData(overrides: Record<string, unknown> = {}) {
  return {
    id: 'center-id',
    entityType: 'table',
    name: 'orders',
    displayName: 'Orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    isCenter: true,
    serviceName: 'svc',
    pathLabel: 'svc / db / schema',
    truncatedFqn: 'svc.db.schema.orders',
    columns: [
      { fqn: 'svc.db.schema.orders.id', name: 'id' },
      { fqn: 'svc.db.schema.orders.amount', name: 'amount' },
    ],
    upstreamCount: 0,
    downstreamCount: 0,
    ...overrides,
  };
}

describe('LineageNode', () => {
  it('carries the pin node test id and a DQ tracing badge', () => {
    const wrapper = mount(LineageNode, {
      props: { data: nodeData({ dqTraced: true }) },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="lineage-node-svc.db.schema.orders"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-node-dq-badge"]').exists()).toBe(true);
    expect(wrapper.attributes('data-dq-traced')).toBe('true');
  });

  it('offers upstream expand when the paging count says children exist', async () => {
    const onExpand = vi.fn();
    const wrapper = mount(LineageNode, {
      props: {
        data: nodeData({
          hasUpstream: false,
          upstreamCount: 2,
          hasDownstream: false,
          onExpandChildren: onExpand,
        }),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const button = wrapper.find('[data-testid="lineage-node-expand-upstream"]');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    expect(onExpand).toHaveBeenCalledWith('upstream');
    // No upstream count and no edges: no expand handle (nothing to load).
    const leaf = mount(LineageNode, {
      props: { data: nodeData({ hasUpstream: false, upstreamCount: 0, hasDownstream: false }) },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(leaf.find('[data-testid="lineage-node-expand-upstream"]').exists()).toBe(false);
  });

  it('offers collapse for a node whose children were loaded here', async () => {
    const onCollapse = vi.fn();
    const wrapper = mount(LineageNode, {
      props: {
        data: nodeData({
          hasDownstream: true,
          expandedDownstream: true,
          side: 'downstream',
          onCollapseChildren: onCollapse,
        }),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const button = wrapper.find('[data-testid="lineage-node-collapse-downstream"]');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    expect(onCollapse).toHaveBeenCalledWith('downstream');
  });

  it('filters expanded columns to those with lineage when the toggle is on', async () => {
    const onToggle = vi.fn();
    const wrapper = mount(LineageNode, {
      props: {
        data: nodeData({
          expanded: true,
          columnsLineageOnly: true,
          lineageColumnFqns: ['svc.db.schema.orders.id'],
          onToggleColumnsLineageOnly: onToggle,
        }),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="lineage-column-svc.db.schema.orders.id"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-column-svc.db.schema.orders.amount"]').exists()).toBe(false);
    await wrapper.find('[data-testid="lineage-node-columns-lineage-only"]').trigger('click');
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows no node menu when not editable, and the full menu when editable', async () => {
    const locked = mount(LineageNode, {
      props: { data: nodeData({ isNodeEditable: false }) },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(locked.find('[data-testid="lineage-node-menu"]').exists()).toBe(false);

    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const wrapper = mount(LineageNode, {
      props: {
        data: nodeData({
          isNodeEditable: true,
          canDeleteNode: true,
          onEditLineage: onEdit,
          onDeleteNode: onDelete,
        }),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="lineage-node-menu"]').exists()).toBe(true);
    await wrapper.find('[data-testid="lineage-node-menu"]').trigger('click');
    await flushPromises();
    const deleteItem = document.body.querySelector('[data-testid="lineage-menu-delete"]') as HTMLElement;
    expect(deleteItem).not.toBeNull();
    deleteItem.click();
    expect(onDelete).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    locked.unmount();
  });

  it('column rows carry a column menu that edits with the column FQN', async () => {
    const onEdit = vi.fn();
    const wrapper = mount(LineageNode, {
      props: {
        data: nodeData({ expanded: true, isNodeEditable: true, onEditLineage: onEdit }),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const menus = wrapper.findAll('[data-testid="lineage-column-menu"]');
    expect(menus).toHaveLength(2);
    await menus[0].trigger('click');
    await flushPromises();
    const upstream = document.body.querySelector(
      '[data-testid="lineage-menu-edit-upstream"]',
    ) as HTMLElement;
    upstream.click();
    expect(onEdit).toHaveBeenCalledWith('upstream', 'svc.db.schema.orders.id');
    wrapper.unmount();
  });
});
