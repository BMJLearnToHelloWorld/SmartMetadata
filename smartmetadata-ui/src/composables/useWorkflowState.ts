/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, reactive, watch, type ComputedRef } from 'vue';
import type {
  WorkflowConnection,
  WorkflowDataAssetFilter,
  WorkflowDefinitionFull,
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowMetadata,
  WorkflowNodeConfig,
} from '@/types/governance';

/**
 * Official useWorkflowState (pin a3012259ca), ported 1:1. The state holds
 * the flow nodes/edges, the definition, selection, sidebar/drawer/modal
 * flags, the start-node form config, and the workflow metadata. In Vue the
 * canvas and the sidebars share this one reactive state directly — there is
 * no separate zustand store to sync with (see useWorkflowBuilder), so the
 * official `syncWithStore` step has no counterpart here.
 */

export interface WorkflowBuilderState {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
  workflowDefinition: WorkflowDefinitionFull | null;
  selectedNode: WorkflowFlowNode | null;
  isConfigSidebarOpen: boolean;
  isWorkflowFormDrawerOpen: boolean;
  loading: boolean;
  isDragging: boolean;
  pendingConnection: WorkflowConnection | null;
  isConnectionModalOpen: boolean;
  modalPosition: { x: number; y: number } | undefined;
  focusedConnection: { sourceId: string; targetId: string } | null;
  editingEdge: WorkflowFlowEdge | null;
  config: WorkflowNodeConfig;
  hasStartNode: boolean;
  isStartNodeConfigured: boolean;
  workflowMetadata: WorkflowMetadata | null;
}

// Pure merge helpers for updateWorkflowDefinitionWithMerge() - no hook/prop
// dependency, so they live at module scope.
function mergeTriggerConfig(
  prevTrigger: unknown,
  updatesTrigger: unknown,
): Record<string, unknown> {
  const prevConfig =
    prevTrigger && typeof prevTrigger === 'object' && 'config' in prevTrigger
      ? (prevTrigger as { config: Record<string, unknown> }).config
      : {};
  const updatesConfig =
    updatesTrigger &&
    typeof updatesTrigger === 'object' &&
    'config' in updatesTrigger
      ? (updatesTrigger as { config: Record<string, unknown> }).config
      : {};
  return { ...prevConfig, ...updatesConfig };
}

function mergeTrigger(
  prevTrigger: unknown,
  updatesTrigger: unknown,
): Record<string, unknown> {
  const prevTriggerObj =
    prevTrigger && typeof prevTrigger === 'object'
      ? (prevTrigger as Record<string, unknown>)
      : {};
  const updatesTriggerObj =
    updatesTrigger && typeof updatesTrigger === 'object'
      ? (updatesTrigger as Record<string, unknown>)
      : {};
  return {
    ...prevTriggerObj,
    ...updatesTriggerObj,
    config: mergeTriggerConfig(prevTrigger, updatesTrigger),
  };
}

function mergeWorkflowDefinitionUpdates(
  current: WorkflowDefinitionFull,
  updates: Partial<WorkflowDefinitionFull>,
): WorkflowDefinitionFull {
  return {
    ...current,
    ...updates,
    trigger: updates.trigger
      ? mergeTrigger(current.trigger, updates.trigger)
      : current.trigger,
  };
}

function hasStartNodeSavedConfig(
  startData: WorkflowFlowNode['data'] | undefined,
): boolean {
  return Boolean(
    startData?.lastSaved ||
      startData?.userModified ||
      (startData?.name && (startData?.dataAssets?.length ?? 0) > 0),
  );
}

function hasStartNodeTriggerConfig(
  startData: WorkflowFlowNode['data'] | undefined,
): boolean {
  return Boolean(
    startData?.triggerType || startData?.eventType || startData?.scheduleType,
  );
}

function hasStartNodeInputOutputConfig(
  startData: WorkflowFlowNode['data'] | undefined,
): boolean {
  return Boolean(startData?.input || startData?.output);
}

// Pure derivation used by the start-node sync watcher - no hook/prop
// dependency, so it lives at module scope.
function computeStartNodeConfigState(nodes: WorkflowFlowNode[]): {
  hasStart: boolean;
  isConfigured: boolean;
} {
  const startNode = nodes.find((node) => node.type === 'startEvent');
  const hasStart = Boolean(startNode);
  const startData = startNode?.data;
  const isConfigured =
    hasStart &&
    (hasStartNodeSavedConfig(startData) ||
      hasStartNodeTriggerConfig(startData) ||
      hasStartNodeInputOutputConfig(startData));
  return { hasStart, isConfigured };
}

export interface UseWorkflowStateReturn {
  state: WorkflowBuilderState;
  hasNodes: ComputedRef<boolean>;
  hasEdges: ComputedRef<boolean>;
  isNewWorkflow: ComputedRef<boolean>;
  canSave: ComputedRef<boolean>;
  updateMultipleState: (updates: Partial<WorkflowBuilderState>) => void;
  updateConfig: <K extends keyof WorkflowNodeConfig>(
    key: K,
    value: WorkflowNodeConfig[K],
  ) => void;
  updateWorkflowDefinition: (updates: Record<string, unknown>) => void;
  updateWorkflowDefinitionWithMerge: (
    updates: Partial<WorkflowDefinitionFull>,
  ) => void;
  updateDataAssetFilters: (
    updater: (
      filters: WorkflowDataAssetFilter[],
    ) => WorkflowDataAssetFilter[],
  ) => void;
  addDataAssetFilter: (dataAsset?: string) => void;
  removeFromConfigArray: <K extends keyof WorkflowNodeConfig>(
    key: K,
    itemToRemove: string,
  ) => void;
  handleEventTypeChange: (event: { target: { value: string | string[] } }) => void;
  setNodes: (
    value: WorkflowFlowNode[] | ((prev: WorkflowFlowNode[]) => WorkflowFlowNode[]),
  ) => void;
  setEdges: (
    value: WorkflowFlowEdge[] | ((prev: WorkflowFlowEdge[]) => WorkflowFlowEdge[]),
  ) => void;
  setSelectedNode: (value: WorkflowFlowNode | null) => void;
  setIsConfigSidebarOpen: (value: boolean) => void;
  setIsWorkflowFormDrawerOpen: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  setWorkflowDefinition: (value: WorkflowDefinitionFull | null) => void;
  setWorkflowMetadata: (value: WorkflowMetadata | null) => void;
  setPendingConnection: (value: WorkflowConnection | null) => void;
  setIsConnectionModalOpen: (value: boolean) => void;
  setModalPosition: (value: { x: number; y: number } | undefined) => void;
  setFocusedConnection: (
    value: { sourceId: string; targetId: string } | null,
  ) => void;
  setEditingEdge: (value: WorkflowFlowEdge | null) => void;
  setIsDragging: (value: boolean) => void;
}

export function useWorkflowState(options: {
  initialConfig?: Partial<WorkflowNodeConfig>;
  fqn?: string;
} = {}): UseWorkflowStateReturn {
  const { initialConfig, fqn } = options;
  const defaultConfig: WorkflowNodeConfig = {
    name: '',
    description: '',
    dataAssets: [],
    triggerType: 'eventBasedEntity',
    eventType: ['Created', 'Updated'],
    excludeFields: [],
    include: [],
    triggerFilter: '',
    scheduleType: '',
    cronExpression: '',
    batchSize: 100,
    dataAssetFilters: [],
    ...initialConfig,
  };

  const state = reactive<WorkflowBuilderState>({
    nodes: [],
    edges: [],
    workflowDefinition: null,
    selectedNode: null,
    isConfigSidebarOpen: false,
    isWorkflowFormDrawerOpen: false,
    loading: false,
    isDragging: false,
    pendingConnection: null,
    isConnectionModalOpen: false,
    modalPosition: undefined,
    focusedConnection: null,
    editingEdge: null,
    config: defaultConfig,
    hasStartNode: false,
    isStartNodeConfigured: false,
    workflowMetadata: null,
  });

  const updateMultipleState = (updates: Partial<WorkflowBuilderState>): void => {
    Object.assign(state, updates);
  };

  const updateConfig = <K extends keyof WorkflowNodeConfig>(
    key: K,
    value: WorkflowNodeConfig[K],
  ): void => {
    state.config = { ...state.config, [key]: value };
  };

  const updateWorkflowDefinition = (updates: Record<string, unknown>): void => {
    if (state.workflowDefinition) {
      state.workflowDefinition = {
        ...state.workflowDefinition,
        ...updates,
      } as WorkflowDefinitionFull;
    }
  };

  const updateWorkflowDefinitionWithMerge = (
    updates: Partial<WorkflowDefinitionFull>,
  ): void => {
    if (!state.workflowDefinition) {
      return;
    }
    // Deep merge the updates with existing workflow definition
    state.workflowDefinition = mergeWorkflowDefinitionUpdates(
      state.workflowDefinition,
      updates,
    );
  };

  const updateDataAssetFilters = (
    updater: (filters: WorkflowDataAssetFilter[]) => WorkflowDataAssetFilter[],
  ): void => {
    state.config = {
      ...state.config,
      dataAssetFilters: updater(state.config.dataAssetFilters),
    };
  };

  const addDataAssetFilter = (dataAsset?: string): void => {
    const existingDataAssets = state.config.dataAssetFilters.map(
      (df) => df.dataAsset,
    );
    const availableDataAssets = state.config.dataAssets.filter(
      (asset) => !existingDataAssets.includes(asset),
    );
    if (availableDataAssets.length === 0) {
      return;
    }
    const targetDataAsset =
      dataAsset && availableDataAssets.includes(dataAsset)
        ? dataAsset
        : availableDataAssets[0];
    const newId =
      state.config.dataAssetFilters.length > 0
        ? Math.max(...state.config.dataAssetFilters.map((df) => df.id)) + 1
        : 1;
    updateDataAssetFilters((filters) => [
      ...filters,
      {
        id: newId,
        dataAsset: targetDataAsset,
      },
    ]);
  };

  const removeFromConfigArray = <K extends keyof WorkflowNodeConfig>(
    key: K,
    itemToRemove: string,
  ): void => {
    const updatedArray = (state.config[key] as string[]).filter(
      (item) => item !== itemToRemove,
    );
    state.config = { ...state.config, [key]: updatedArray };
  };

  const handleEventTypeChange = (event: {
    target: { value: string | string[] };
  }): void => {
    const value = event.target.value;
    const newEventTypes =
      typeof value === 'string' ? value.split(',') : value;
    updateConfig('eventType', newEventTypes);
  };

  const hasNodes = computed(() => state.nodes.length > 0);
  const hasEdges = computed(() => state.edges.length > 0);
  const isNewWorkflow = computed(
    () => !fqn || state.workflowMetadata?.isNewWorkflow === true,
  );
  const canSave = computed(
    () => state.hasStartNode && state.isStartNodeConfigured,
  );

  watch(
    () => state.nodes,
    () => {
      // If start node exists and has any configuration data, consider it configured
      const { hasStart, isConfigured } = computeStartNodeConfigState(
        state.nodes,
      );
      if (
        state.hasStartNode !== hasStart ||
        state.isStartNodeConfigured !== isConfigured
      ) {
        state.hasStartNode = hasStart;
        state.isStartNodeConfigured = isConfigured;
      }
    },
    { deep: true },
  );

  const setNodes = (
    value:
      | WorkflowFlowNode[]
      | ((prev: WorkflowFlowNode[]) => WorkflowFlowNode[]),
  ): void => {
    state.nodes =
      typeof value === 'function' ? value(state.nodes) : value;
  };

  const setEdges = (
    value:
      | WorkflowFlowEdge[]
      | ((prev: WorkflowFlowEdge[]) => WorkflowFlowEdge[]),
  ): void => {
    state.edges =
      typeof value === 'function' ? value(state.edges) : value;
  };

  return {
    state,
    hasNodes,
    hasEdges,
    isNewWorkflow,
    canSave,
    updateMultipleState,
    updateConfig,
    updateWorkflowDefinition,
    updateWorkflowDefinitionWithMerge,
    updateDataAssetFilters,
    addDataAssetFilter,
    removeFromConfigArray,
    handleEventTypeChange,
    setNodes,
    setEdges,
    setSelectedNode: (value) => {
      state.selectedNode = value;
    },
    setIsConfigSidebarOpen: (value) => {
      state.isConfigSidebarOpen = value;
    },
    setIsWorkflowFormDrawerOpen: (value) => {
      state.isWorkflowFormDrawerOpen = value;
    },
    setLoading: (value) => {
      state.loading = value;
    },
    setWorkflowDefinition: (value) => {
      state.workflowDefinition = value;
    },
    setWorkflowMetadata: (value) => {
      state.workflowMetadata = value;
    },
    setPendingConnection: (value) => {
      state.pendingConnection = value;
    },
    setIsConnectionModalOpen: (value) => {
      state.isConnectionModalOpen = value;
    },
    setModalPosition: (value) => {
      state.modalPosition = value;
    },
    setFocusedConnection: (value) => {
      state.focusedConnection = value;
    },
    setEditingEdge: (value) => {
      state.editingEdge = value;
    },
    setIsDragging: (value) => {
      state.isDragging = value;
    },
  };
}
