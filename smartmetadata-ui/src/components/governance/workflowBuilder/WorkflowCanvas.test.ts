/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VueFlow } from '@vue-flow/core';
import WorkflowCanvas from './WorkflowCanvas.vue';
import { mountWithBuilder } from './testHarness';

/**
 * Official WorkflowCanvas behavior on the OSS capability set: the fixture
 * definition renders its four nodes and four edges; view-mode drag applies
 * through the guarded nodes-change handler; connect is not bound and
 * remove changes are filtered out, so structural edits stay inert.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorkflowCanvas', () => {
  it('renders the fixture nodes and edges in view mode', async () => {
    const { wrapper } = await mountWithBuilder(WorkflowCanvas);

    expect(
      wrapper.find('[data-testid="workflow-canvas"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="workflow-start-node"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="workflow-end-node"]').exists(),
    ).toBe(true);
    expect(
      wrapper
        .find('[data-testid="workflow-userapprovaltask-node"]')
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find('[data-testid="workflow-setentityattributetask-node"]')
        .exists(),
    ).toBe(true);
    expect(wrapper.findAll('.vue-flow__edge')).toHaveLength(4);
  });

  it('applies a view-mode node drag through nodes-change', async () => {
    const { wrapper, builder } = await mountWithBuilder(WorkflowCanvas);
    const vueFlow = wrapper.findComponent(VueFlow);
    expect(vueFlow.exists()).toBe(true);
    // View mode + allowViewModeDrag: dragging is enabled.
    expect(vueFlow.props('nodesDraggable')).toBe(true);
    expect(vueFlow.props('nodesConnectable')).toBe(false);

    await vueFlow.vm.$emit('nodes-change', [
      {
        id: 'userApprovalTask_1',
        type: 'position',
        position: { x: 400, y: 50 },
        dragging: true,
      },
    ]);
    const moved = builder.state.state.nodes.find(
      (n) => n.id === 'userApprovalTask_1',
    );
    expect(moved?.position).toEqual({ x: 400, y: 50 });
  });

  it('keeps structural handlers inert: connect does nothing, removes are filtered', async () => {
    const { wrapper, builder } = await mountWithBuilder(WorkflowCanvas);
    const vueFlow = wrapper.findComponent(VueFlow);
    const edgesBefore = builder.state.state.edges.length;
    const nodesBefore = builder.state.state.nodes.length;

    // No connect listener is bound without structural edits.
    await vueFlow.vm.$emit('connect', {
      source: 'start',
      target: 'endEvent_1',
      sourceHandle: null,
      targetHandle: null,
    });
    expect(builder.state.state.edges).toHaveLength(edgesBefore);

    // Remove changes are dropped by the guard.
    await vueFlow.vm.$emit('nodes-change', [
      { id: 'start', type: 'remove' },
    ]);
    const firstEdgeId = builder.state.state.edges[0]?.id ?? '';
    await vueFlow.vm.$emit('edges-change', [
      { id: firstEdgeId, type: 'remove' },
    ]);
    expect(builder.state.state.nodes).toHaveLength(nodesBefore);
    expect(builder.state.state.edges).toHaveLength(edgesBefore);
  });

  it('disables the rearrange control without structural edits', async () => {
    const { wrapper } = await mountWithBuilder(WorkflowCanvas);
    const rearrange = wrapper.find('[data-testid="rearrange-button"]');
    expect(rearrange.exists()).toBe(true);
    expect(rearrange.attributes('disabled')).toBeDefined();
  });

  it('shows the default zoom percentage', async () => {
    const { wrapper } = await mountWithBuilder(WorkflowCanvas);
    expect(wrapper.find('.workflow-custom-controls__zoom').text()).toBe(
      '50%',
    );
  });
});
