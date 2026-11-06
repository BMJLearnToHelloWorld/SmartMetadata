/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodeChange } from '@vue-flow/core';
import WorkflowCanvas from '@/components/governance/workflowBuilder/WorkflowCanvas.vue';
import { mountWithBuilder } from '@/components/governance/workflowBuilder/testHarness';

/**
 * Official WorkflowBuilder.tsx page effects, as wired in the orchestrator:
 * canvas changes snapshot 500ms after they settle, undo/redo apply a
 * saved state, and rearrange snapshots before and after the layout.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useWorkflowBuilder history wiring', () => {
  it('snapshots canvas changes after the 500ms debounce, then undoes and redoes them', async () => {
    const { builder } = await mountWithBuilder(WorkflowCanvas);
    const original = builder.state.state.nodes.find(
      (n) => n.id === 'userApprovalTask_1',
    )?.position;
    expect(original).toBeDefined();

    // Official history starts empty and canUndo needs two snapshots: the
    // first change alone is not undoable, the second makes the first one
    // the undo target.
    vi.useFakeTimers();
    const firstChange: NodeChange = {
      id: 'userApprovalTask_1',
      type: 'position',
      position: { x: 400, y: 50 },
      from: original ?? { x: 0, y: 0 },
      dragging: true,
    };
    builder.logic.onNodesChange([firstChange]);
    await nextTick();
    expect(builder.history.canUndo.value).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(builder.history.canUndo.value).toBe(false);

    const secondChange: NodeChange = {
      id: 'userApprovalTask_1',
      type: 'position',
      position: { x: 500, y: 80 },
      from: { x: 400, y: 50 },
      dragging: true,
    };
    builder.logic.onNodesChange([secondChange]);
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    expect(builder.history.canUndo.value).toBe(true);

    builder.handleUndo();
    expect(
      builder.state.state.nodes.find((n) => n.id === 'userApprovalTask_1')
        ?.position,
    ).toEqual({ x: 400, y: 50 });
    expect(builder.history.canRedo.value).toBe(true);

    builder.handleRedo();
    expect(
      builder.state.state.nodes.find((n) => n.id === 'userApprovalTask_1')
        ?.position,
    ).toEqual({ x: 500, y: 80 });
  });

  it('does not snapshot the initial load', async () => {
    const { builder } = await mountWithBuilder(WorkflowCanvas);
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(1000);
    expect(builder.history.canUndo.value).toBe(false);
  });

  it('rearranges with a before/after snapshot', async () => {
    const { builder } = await mountWithBuilder(WorkflowCanvas);
    const loaded = builder.state.state.nodes.map((n) => ({
      id: n.id,
      position: { ...n.position },
    }));
    // Move a node off the dagre layout, then rearrange: the layout is
    // restored and both the pre-move and post-layout states are kept.
    builder.logic.onNodesChange([
      {
        id: 'userApprovalTask_1',
        type: 'position',
        position: { x: 400, y: 50 },
        dragging: true,
      } as NodeChange,
    ]);
    const moved = builder.state.state.nodes.map((n) => ({
      id: n.id,
      position: { ...n.position },
    }));
    expect(moved).not.toEqual(loaded);

    builder.handleRearrange();
    expect(builder.history.canUndo.value).toBe(true);
    const rearranged = builder.state.state.nodes.map((n) => ({
      id: n.id,
      position: { ...n.position },
    }));
    expect(rearranged).toEqual(loaded);

    builder.handleUndo();
    const undone = builder.state.state.nodes.map((n) => ({
      id: n.id,
      position: { ...n.position },
    }));
    expect(undone).toEqual(moved);
  });

  it('snapshots before an edge delete, and undo restores the edge', async () => {
    const { builder } = await mountWithBuilder(WorkflowCanvas);
    const edgeId = builder.state.state.edges[0]?.id;
    expect(edgeId).toBeDefined();
    const countBefore = builder.state.state.edges.length;

    // A prior snapshot is needed before the delete is undoable (official
    // history needs two entries for canUndo).
    vi.useFakeTimers();
    builder.logic.onNodesChange([
      {
        id: 'userApprovalTask_1',
        type: 'position',
        position: { x: 400, y: 50 },
        dragging: true,
      } as NodeChange,
    ]);
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    expect(builder.history.canUndo.value).toBe(false);

    builder.handleEdgeDelete(edgeId as string);
    expect(builder.state.state.edges).toHaveLength(countBefore - 1);
    expect(builder.history.canUndo.value).toBe(true);
    builder.handleUndo();
    expect(builder.state.state.edges).toHaveLength(countBefore);
  });
});
