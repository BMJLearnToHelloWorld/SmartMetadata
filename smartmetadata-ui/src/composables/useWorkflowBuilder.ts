/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  computed,
  inject,
  provide,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue';
import { message } from 'ant-design-vue';
import type {
  WorkflowDefinitionFull,
  WorkflowTriggerFieldsConfig,
} from '@/types/governance';
import { setFieldPatch } from '@/admin/jsonPatch';
import { getWorkflowTriggerFields } from '@/api/metadataTypes';
import {
  patchWorkflowDefinition,
  resumeWorkflow,
  suspendWorkflow,
  triggerWorkflow,
} from '@/api/workflows';
import { isGitSinkNode } from '@/utils/workflowConfig';
import { applyFlowchartLayout } from '@/utils/workflowLayout';
import { isStartNode } from '@/utils/workflowNodeUtils';
import { useWorkflowNavigationBlock, type UseWorkflowNavigationBlockReturn } from './useWorkflowNavigationBlock';
import { useWorkflowActions, type UseWorkflowActionsReturn } from './useWorkflowActions';
import {
  useWorkflowEdgeManagement,
  type UseWorkflowEdgeManagementReturn,
} from './useWorkflowEdgeManagement';
import { useWorkflowHistory, type UseWorkflowHistoryReturn } from './useWorkflowHistory';
import { useWorkflowLogic, type UseWorkflowLogicReturn } from './useWorkflowLogic';
import { useWorkflowMode, type UseWorkflowModeReturn } from './useWorkflowMode';
import { useWorkflowState, type UseWorkflowStateReturn } from './useWorkflowState';

/**
 * The builder's single owner (ruling §4): one `useWorkflowBuilder`
 * composable owns nodes/edges/selection/mode/history and is provided to the
 * canvas, header, and both sidebars via provide/inject — the direct mirror
 * of official's WorkflowModeProvider + useWorkflowLogic + useWorkflowActions.
 * No new store library: plain refs/computed + provide/inject, as the
 * product's graphs do. The official zustand `useWorkflowStore` has no
 * counterpart here — canvas and sidebars share this one reactive state, so
 * the official `syncWithStore` step is dropped (recorded in the ruling).
 *
 * History wiring (official WorkflowBuilder.tsx page effects): canvas changes
 * snapshot 500ms after they settle, undo/redo apply a saved state and
 * suppress the snapshot while they do, and rearrange / edge delete /
 * node-config save snapshot before they mutate.
 */

export interface UseWorkflowBuilderReturn {
  state: UseWorkflowStateReturn;
  mode: UseWorkflowModeReturn;
  history: UseWorkflowHistoryReturn;
  edgeManagement: UseWorkflowEdgeManagementReturn;
  logic: UseWorkflowLogicReturn;
  actions: UseWorkflowActionsReturn;
  workflowDefinition: Ref<WorkflowDefinitionFull | null>;
  isUndoRedoInProgress: Ref<boolean>;
  handleUndo: () => void;
  handleRedo: () => void;
  handleRearrange: () => void;
  handleEdgeDelete: (edgeId: string) => void;
  handleNodeConfigSave: (
    nodeId: string,
    config: Record<string, unknown>,
  ) => void;
  // Page-level (official WorkflowBuilder.tsx) state and handlers.
  triggerFieldsConfig: Ref<WorkflowTriggerFieldsConfig>;
  hasGitSinkNode: ComputedRef<boolean>;
  isEnforceMode: ComputedRef<boolean>;
  startEventDataAssets: ComputedRef<string[]>;
  startEventTriggerType: ComputedRef<string>;
  isSuspended: ComputedRef<boolean>;
  isRunLoading: Ref<boolean>;
  showDeleteModal: Ref<boolean>;
  isDeleting: Ref<boolean>;
  hasNodeConfigSaved: Ref<boolean>;
  navigationBlock: UseWorkflowNavigationBlockReturn;
  handleRevertAndCancel: () => void;
  handleSaveWorkflowWithSnapshot: () => Promise<boolean>;
  handleRunWorkflow: () => Promise<void>;
  handleToggleSuspend: () => Promise<void>;
  handleUpdateDisplayName: (newDisplayName: string) => Promise<void>;
  handleShowDeleteModal: () => void;
  handleDeleteModalCancel: () => void;
  handleDeleteWorkflowFromModal: () => Promise<void>;
}

export const workflowBuilderKey: InjectionKey<UseWorkflowBuilderReturn> =
  Symbol('workflowBuilder');

export function useWorkflowBuilder(
  fqn: Ref<string | undefined>,
  options: {
    t?: (key: string, options?: Record<string, unknown>) => string;
  } = {},
): UseWorkflowBuilderReturn {
  const workflowState = useWorkflowState({ fqn: fqn.value });
  const workflowDefinition = computed(
    () => workflowState.state.workflowDefinition,
  );
  const mode = useWorkflowMode(fqn, workflowDefinition);
  const history = useWorkflowHistory();
  const edgeManagement = useWorkflowEdgeManagement(
    workflowState.state,
    mode.isViewMode,
  );
  const logic = useWorkflowLogic(workflowState, {
    fqn,
    mode: {
      allowStructuralGraphEdits: mode.allowStructuralGraphEdits,
      canDragNodesInViewMode: mode.canDragNodesInViewMode,
    },
  });
  const actions = useWorkflowActions(workflowState, {
    mode,
    edgeManagement,
    t: options.t,
  });
  const t = options.t ?? ((key: string): string => key);

  const isUndoRedoInProgress = ref(false);
  const initialLoadRef = ref(true);
  const prevNodesRef = ref(workflowState.state.nodes);
  const prevEdgesRef = ref(workflowState.state.edges);
  let snapshotTimer: ReturnType<typeof setTimeout> | undefined;

  watch(
    () => [workflowState.state.nodes, workflowState.state.edges] as const,
    ([nodes, edges]) => {
      if (initialLoadRef.value) {
        initialLoadRef.value = false;
        prevNodesRef.value = nodes;
        prevEdgesRef.value = edges;
        return;
      }
      if (isUndoRedoInProgress.value) {
        prevNodesRef.value = nodes;
        prevEdgesRef.value = edges;
        return;
      }
      if (prevNodesRef.value === nodes && prevEdgesRef.value === edges) {
        return;
      }
      clearTimeout(snapshotTimer);
      snapshotTimer = setTimeout(() => {
        if (
          !isUndoRedoInProgress.value &&
          (nodes.length > 0 || edges.length > 0)
        ) {
          history.saveState(nodes, edges, 'Workflow State Changed');
        }
      }, 500);
      prevNodesRef.value = nodes;
      prevEdgesRef.value = edges;
    },
  );

  const handleUndo = (): void => {
    const previousState = history.undo();
    if (previousState) {
      isUndoRedoInProgress.value = true;
      workflowState.setNodes(previousState.nodes);
      workflowState.setEdges(previousState.edges);
      setTimeout(() => {
        isUndoRedoInProgress.value = false;
      }, 100);
    }
  };

  const handleRedo = (): void => {
    const nextState = history.redo();
    if (nextState) {
      isUndoRedoInProgress.value = true;
      workflowState.setNodes(nextState.nodes);
      workflowState.setEdges(nextState.edges);
      setTimeout(() => {
        isUndoRedoInProgress.value = false;
      }, 100);
    }
  };

  const handleRearrange = (): void => {
    const { nodes, edges } = workflowState.state;
    if (nodes.length === 0) {
      return;
    }
    history.saveState(nodes, edges, 'Before Rearrange');
    const { nodes: layoutedNodes, edges: layoutedEdges } =
      applyFlowchartLayout(nodes, edges);
    workflowState.setNodes(layoutedNodes);
    workflowState.setEdges(layoutedEdges);
    history.saveState(layoutedNodes, layoutedEdges, 'Rearrange Workflow');
  };

  const handleEdgeDelete = (edgeId: string): void => {
    const { nodes, edges } = workflowState.state;
    history.saveState(nodes, edges, 'Before Edge Delete');
    edgeManagement.handleEdgeDelete(edgeId);
  };

  const handleNodeConfigSave = (
    nodeId: string,
    config: Record<string, unknown>,
  ): void => {
    const { nodes, edges } = workflowState.state;
    history.saveState(nodes, edges, 'Before Node Configuration Update');
    actions.handleNodeConfigSave(nodeId, config);
    hasNodeConfigSaved.value = true;
  };

  // Page-level derivations (official WorkflowBuilder.tsx).
  const startEventNode = computed(
    () => workflowState.state.nodes.find((n) => isStartNode(n)) ?? null,
  );
  const startEventDataAssets = computed<string[]>(
    () => (startEventNode.value?.data?.dataAssets as string[] | undefined) ?? [],
  );
  const startEventTriggerType = computed(
    () => (startEventNode.value?.data?.triggerType as string | undefined) ?? '',
  );
  // The approval mode chosen on the start node in this session, else the
  // one the workflow was saved with.
  const isEnforceMode = computed(() => {
    const trigger = workflowDefinition.value?.trigger;
    const triggerConfig =
      trigger && typeof trigger === 'object' && !Array.isArray(trigger)
        ? (trigger as { config?: Record<string, unknown> }).config
        : undefined;
    return (
      (startEventNode.value?.data?.approvalMode ??
        triggerConfig?.approvalMode) === 'Enforce'
    );
  });
  const hasGitSinkNode = computed(() =>
    workflowState.state.nodes.some((n) => isGitSinkNode(n)),
  );
  const isSuspended = computed(
    () => Boolean(workflowDefinition.value?.suspended),
  );

  // The trigger-fields registry is static and entity-agnostic: fetch it
  // once at the page level so opening the start node's config panel
  // triggers no per-open request.
  const triggerFieldsConfig = ref<WorkflowTriggerFieldsConfig>({
    common: [],
    entitySpecific: {},
  });
  void getWorkflowTriggerFields()
    .then((config) => {
      triggerFieldsConfig.value = config;
    })
    .catch((error: unknown) => {
      message.error(error instanceof Error ? error.message : String(error));
    });

  const savedStateOnEdit = ref<{
    nodes: typeof workflowState.state.nodes;
    edges: typeof workflowState.state.edges;
  } | null>(null);
  const hasNodeConfigSaved = ref(false);
  const isRunLoading = ref(false);
  const showDeleteModal = ref(false);
  const isDeleting = ref(false);

  // Snapshot the graph when entering edit mode (after loading) and clear
  // it on leaving, so revert-and-cancel can restore the pre-edit state.
  watch(
    () => [mode.isEditMode.value, workflowState.state.loading] as const,
    ([isEditMode, loading]) => {
      if (loading) {
        return;
      }
      if (isEditMode && !savedStateOnEdit.value) {
        savedStateOnEdit.value = {
          edges: [...workflowState.state.edges],
          nodes: [...workflowState.state.nodes],
        };
      } else if (!isEditMode && savedStateOnEdit.value) {
        savedStateOnEdit.value = null;
      }
    },
  );

  const handleRevertAndCancel = (): void => {
    if (savedStateOnEdit.value) {
      workflowState.setNodes(savedStateOnEdit.value.nodes);
      workflowState.setEdges(savedStateOnEdit.value.edges);
      savedStateOnEdit.value = null;
    }
    hasNodeConfigSaved.value = false;
    mode.enterViewMode();
  };

  const handleSaveWorkflowWithSnapshot = async (): Promise<boolean> => {
    const success = await actions.handleSaveWorkflow();
    if (success) {
      hasNodeConfigSaved.value = false;
    }
    return success;
  };

  const handleRunWorkflow = async (): Promise<void> => {
    const workflowFqn = workflowState.state.workflowMetadata?.name;
    if (!workflowFqn) {
      message.error(t('workflows.builder.workflowFqnRequired'));
      return;
    }
    try {
      isRunLoading.value = true;
      await triggerWorkflow(workflowFqn);
      message.success(t('workflows.builder.workflowTriggeredSuccessfully'));
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      isRunLoading.value = false;
    }
  };

  const handleToggleSuspend = async (): Promise<void> => {
    const definition = workflowDefinition.value;
    if (!definition) {
      return;
    }
    try {
      await (isSuspended.value ? resumeWorkflow : suspendWorkflow)(
        definition.name,
      );
      workflowState.setWorkflowDefinition({
        ...definition,
        suspended: !isSuspended.value,
      });
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleUpdateDisplayName = async (
    newDisplayName: string,
  ): Promise<void> => {
    const definition = workflowDefinition.value;
    try {
      if (!definition?.id) {
        message.error(t('workflows.builder.workflowIdRequired'));
        return;
      }
      const patch = setFieldPatch(
        '/displayName',
        definition.displayName,
        newDisplayName,
      );
      const response = await patchWorkflowDefinition(definition.id, patch);
      actions.handleWorkflowMetadataUpdate({
        description: workflowState.state.workflowMetadata?.description || '',
        displayName: response.displayName || newDisplayName,
      });
      workflowState.setWorkflowDefinition(
        response as WorkflowDefinitionFull,
      );
      message.success(t('workflows.builder.displayNameUpdated'));
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleShowDeleteModal = (): void => {
    showDeleteModal.value = true;
  };

  const handleDeleteModalCancel = (): void => {
    showDeleteModal.value = false;
  };

  const handleDeleteWorkflowFromModal = async (): Promise<void> => {
    try {
      isDeleting.value = true;
      await actions.performDeleteWorkflow();
    } finally {
      isDeleting.value = false;
      showDeleteModal.value = false;
    }
  };

  const navBlockEnabled = computed(
    () => mode.isEditMode.value && hasNodeConfigSaved.value,
  );
  const navigationBlock = useWorkflowNavigationBlock({
    enabled: navBlockEnabled,
    onSaveWorkflow: handleSaveWorkflowWithSnapshot,
  });

  const builder: UseWorkflowBuilderReturn = {
    state: workflowState,
    mode,
    history,
    edgeManagement,
    logic,
    actions,
    workflowDefinition,
    isUndoRedoInProgress,
    handleUndo,
    handleRedo,
    handleRearrange,
    handleEdgeDelete,
    handleNodeConfigSave,
    triggerFieldsConfig,
    hasGitSinkNode,
    isEnforceMode,
    startEventDataAssets,
    startEventTriggerType,
    isSuspended,
    isRunLoading,
    showDeleteModal,
    isDeleting,
    hasNodeConfigSaved,
    navigationBlock,
    handleRevertAndCancel,
    handleSaveWorkflowWithSnapshot,
    handleRunWorkflow,
    handleToggleSuspend,
    handleUpdateDisplayName,
    handleShowDeleteModal,
    handleDeleteModalCancel,
    handleDeleteWorkflowFromModal,
  };
  provide(workflowBuilderKey, builder);
  return builder;
}

export function useWorkflowBuilderContext(): UseWorkflowBuilderReturn {
  const builder = inject(workflowBuilderKey);
  if (!builder) {
    throw new Error(
      'useWorkflowBuilderContext must be used within a WorkflowDetailView builder',
    );
  }
  return builder;
}
