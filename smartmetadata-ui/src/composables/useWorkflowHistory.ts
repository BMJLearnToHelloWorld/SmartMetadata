/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type {
  WorkflowFlowEdge,
  WorkflowFlowNode,
} from '@/types/governance';

/**
 * Official useWorkflowHistory (pin a3012259ca), ported 1:1: the undo/redo
 * stack for canvas edits, max 50 states. Snapshots are deep copies
 * (JSON round-trip, as in official) so later mutations cannot rewrite
 * history.
 */

export interface WorkflowHistoryState {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
  timestamp: number;
  action: string;
}

export interface UseWorkflowHistoryReturn {
  saveState: (
    nodes: WorkflowFlowNode[],
    edges: WorkflowFlowEdge[],
    action?: string,
  ) => void;
  undo: () => WorkflowHistoryState | null;
  redo: () => WorkflowHistoryState | null;
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  clearHistory: () => void;
  getHistoryInfo: () => {
    totalStates: number;
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
    currentAction: string;
  };
}

export function useWorkflowHistory(options: {
  maxHistorySize?: number;
} = {}): UseWorkflowHistoryReturn {
  const { maxHistorySize = 50 } = options;
  const history: Ref<WorkflowHistoryState[]> = ref([]);
  const currentIndex = ref(-1);

  const saveState = (
    nodes: WorkflowFlowNode[],
    edges: WorkflowFlowEdge[],
    action = 'Unknown Action',
  ): void => {
    const newState: WorkflowHistoryState = {
      nodes: JSON.parse(JSON.stringify(nodes)) as WorkflowFlowNode[],
      edges: JSON.parse(JSON.stringify(edges)) as WorkflowFlowEdge[],
      timestamp: Date.now(),
      action,
    };
    const truncatedHistory = history.value.slice(0, currentIndex.value + 1);
    const newHistory = [...truncatedHistory, newState];
    history.value =
      newHistory.length > maxHistorySize
        ? newHistory.slice(-maxHistorySize)
        : newHistory;
    currentIndex.value = Math.min(currentIndex.value + 1, maxHistorySize - 1);
  };

  const undo = (): WorkflowHistoryState | null => {
    if (currentIndex.value > 0) {
      const newIndex = currentIndex.value - 1;
      currentIndex.value = newIndex;
      return history.value[newIndex];
    }
    return null;
  };

  const redo = (): WorkflowHistoryState | null => {
    if (currentIndex.value < history.value.length - 1) {
      const newIndex = currentIndex.value + 1;
      currentIndex.value = newIndex;
      return history.value[newIndex];
    }
    return null;
  };

  const canUndo = computed(() => currentIndex.value > 0);
  const canRedo = computed(
    () => currentIndex.value < history.value.length - 1,
  );

  const clearHistory = (): void => {
    history.value = [];
    currentIndex.value = -1;
  };

  const getHistoryInfo = (): {
    totalStates: number;
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
    currentAction: string;
  } => ({
    totalStates: history.value.length,
    currentIndex: currentIndex.value,
    canUndo: canUndo.value,
    canRedo: canRedo.value,
    currentAction:
      history.value[currentIndex.value]?.action || 'No action',
  });

  return {
    saveState,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    getHistoryInfo,
  };
}
