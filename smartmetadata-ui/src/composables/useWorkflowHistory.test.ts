/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { WorkflowFlowEdge, WorkflowFlowNode } from '@/types/governance';
import { useWorkflowHistory } from './useWorkflowHistory';

/**
 * Official useWorkflowHistory: JSON deep-copy snapshots, max 50, undo/redo
 * navigation with the redo tail truncated on new saves.
 */

function flowNode(id: string): WorkflowFlowNode {
  return {
    id,
    type: 'startEvent',
    position: { x: 0, y: 0 },
    data: { name: id, label: id, subType: 'startEvent' },
  };
}

function flowEdge(id: string, source: string, target: string): WorkflowFlowEdge {
  return { id, source, target };
}

describe('useWorkflowHistory', () => {
  it('starts empty and cannot undo or redo', () => {
    const history = useWorkflowHistory();
    expect(history.canUndo.value).toBe(false);
    expect(history.canRedo.value).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('undoes and redoes through saved states', () => {
    const history = useWorkflowHistory();
    history.saveState([flowNode('a')], []);
    history.saveState(
      [flowNode('a'), flowNode('b')],
      [flowEdge('e1', 'a', 'b')],
    );
    expect(history.canUndo.value).toBe(true);
    expect(history.canRedo.value).toBe(false);

    const undone = history.undo();
    expect(undone?.nodes.map((n) => n.id)).toEqual(['a']);
    expect(undone?.edges).toEqual([]);
    expect(history.canUndo.value).toBe(false);
    expect(history.canRedo.value).toBe(true);

    const redone = history.redo();
    expect(redone?.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(redone?.edges.map((e) => e.id)).toEqual(['e1']);
    expect(history.canRedo.value).toBe(false);
  });

  it('truncates the redo tail when a new state is saved', () => {
    const history = useWorkflowHistory();
    history.saveState([flowNode('a')], []);
    history.saveState([flowNode('a'), flowNode('b')], []);
    history.undo();
    history.saveState([flowNode('a'), flowNode('c')], []);
    expect(history.canRedo.value).toBe(false);
    expect(history.undo()?.nodes.map((n) => n.id)).toEqual(['a']);
    expect(history.redo()?.nodes.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('caps history at 50 states', () => {
    const history = useWorkflowHistory();
    for (let i = 0; i < 60; i++) {
      history.saveState([flowNode(`n${i}`)], []);
    }
    // 50 entries; walking back 49 times reaches the oldest kept state.
    let state: { nodes: WorkflowFlowNode[] } | null = null;
    let steps = 0;
    while (history.canUndo.value) {
      state = history.undo();
      steps += 1;
    }
    expect(steps).toBe(49);
    expect(state?.nodes.map((n) => n.id)).toEqual(['n10']);
  });

  it('deep-copies snapshots so later mutation cannot corrupt history', () => {
    const history = useWorkflowHistory();
    const node = flowNode('a');
    history.saveState([node], []);
    // Mutating the original object after the save must not rewrite the
    // snapshot; undo returns the state as it was when it was saved.
    node.id = 'mutated';
    history.saveState([flowNode('b')], []);
    expect(history.undo()?.nodes.map((n) => n.id)).toEqual(['a']);
  });
});
