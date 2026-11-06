/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { message } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import {
  deleteWorkflowByFqn,
  updateWorkflowDefinition,
} from '@/api/workflows';
import type {
  WorkflowDefinitionFull,
  WorkflowFlowNode,
  WorkflowMetadata,
} from '@/types/governance';
import {
  buildWorkflowForSave,
  testWorkflow,
} from '@/services/workflowValidation';
import {
  shouldShowForm,
  shouldUseConfigSidebar,
} from '@/utils/workflowNodeUtils';
import type { UseWorkflowEdgeManagementReturn } from './useWorkflowEdgeManagement';
import type { UseWorkflowModeReturn } from './useWorkflowMode';
import type { UseWorkflowStateReturn } from './useWorkflowState';

/**
 * Official useWorkflowActions (pin a3012259ca), ported 1:1. Save is a full
 * PUT (buildWorkflowForSave → updateWorkflowDefinition); Test is
 * testWorkflow (build → POST /validate). Delete exists as a function but its
 * button is never rendered in OSS (allowDeleteWorkflow false).
 *
 * Two product adaptations, both recorded in the ruling:
 * - R-7: the product has no approval-enforced entity-types store (no
 *   Change Request UI), so save/delete skip the store invalidation.
 * - No separate zustand store: the canvas and the sidebars share the one
 *   reactive state, so handleNodeClick does not call syncWithStore().
 */

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export interface UseWorkflowActionsReturn {
  handleNodeConfigSave: (
    nodeId: string,
    config: Record<string, unknown>,
  ) => void;
  handleConfigSidebarClose: () => void;
  handleWorkflowFormDrawerClose: () => void;
  handleTestWorkflow: () => Promise<WorkflowDefinitionFull | undefined>;
  handleNodeClick: (event: MouseEvent, node: WorkflowFlowNode) => void;
  handleSaveWorkflow: () => Promise<boolean>;
  performDeleteWorkflow: () => Promise<void>;
  handleWorkflowMetadataUpdate: (metadata: {
    displayName: string;
    description: string;
    triggerType?: string;
  }) => void;
  handleConnectionSave: UseWorkflowEdgeManagementReturn['handleConnectionSave'];
  handleConnectionCancel: UseWorkflowEdgeManagementReturn['handleConnectionCancel'];
  handleEdgeClick: UseWorkflowEdgeManagementReturn['handleEdgeClick'];
  handleEdgeDelete: UseWorkflowEdgeManagementReturn['handleEdgeDelete'];
  fixMissingEdgeLabels: UseWorkflowEdgeManagementReturn['fixMissingEdgeLabels'];
  fixInvalidEdgeConditions: UseWorkflowEdgeManagementReturn['fixInvalidEdgeConditions'];
}

export function useWorkflowActions(
  workflowState: UseWorkflowStateReturn,
  deps: {
    mode: Pick<UseWorkflowModeReturn, 'isViewMode' | 'enterViewMode'>;
    edgeManagement: UseWorkflowEdgeManagementReturn;
    t?: TranslateFn;
  },
): UseWorkflowActionsReturn {
  const { state, setNodes, setSelectedNode } = workflowState;
  const { edgeManagement, mode } = deps;
  const t: TranslateFn = deps.t ?? ((key: string) => key);
  const router = useRouter();

  // Node configuration save handler
  const handleNodeConfigSave = (
    nodeId: string,
    config: Record<string, unknown>,
  ): void => {
    // Check if this is a Data Completeness node being updated
    const isDataCompletenessUpdate =
      config.subType === 'dataCompletenessTask' && config.qualityBands;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...config,
              lastSaved: new Date().toISOString(),
            },
          };
        }
        return node;
      }),
    );
    if (isDataCompletenessUpdate) {
      edgeManagement.fixInvalidEdgeConditions(
        nodeId,
        config.qualityBands as unknown[],
      );
    }
    setSelectedNode(null);
    state.isConfigSidebarOpen = false;
  };

  // Config sidebar close handler
  const handleConfigSidebarClose = (): void => {
    state.isConfigSidebarOpen = false;
    setSelectedNode(null);
  };

  // Workflow form drawer close handler
  const handleWorkflowFormDrawerClose = (): void => {
    state.isWorkflowFormDrawerOpen = false;
  };

  // Test workflow handler
  const handleTestWorkflow = async (): Promise<
    WorkflowDefinitionFull | undefined
  > => {
    try {
      return await testWorkflow(
        state.nodes,
        state.edges,
        state.workflowDefinition,
        state.workflowMetadata,
        t,
      );
    } catch {
      // testWorkflow / buildWorkflowForSave already show a toast on validation failure
      return undefined;
    }
  };

  // Node click handler
  const handleNodeClick = (event: MouseEvent, node: WorkflowFlowNode): void => {
    event.stopPropagation();
    setSelectedNode(node);
    const nodeType = node.type || '';
    if (!shouldShowForm(nodeType)) {
      state.isConfigSidebarOpen = false;
      state.isWorkflowFormDrawerOpen = false;
      return;
    }
    if (shouldUseConfigSidebar(nodeType)) {
      state.isConfigSidebarOpen = true;
      state.isWorkflowFormDrawerOpen = false;
    } else {
      state.isWorkflowFormDrawerOpen = true;
      state.isConfigSidebarOpen = false;
    }
  };

  const handleSaveWorkflow = async (): Promise<boolean> => {
    try {
      if (!state.workflowDefinition || !state.workflowMetadata) {
        message.error(t('workflows.builder.workflowDataMissing'));
        return false;
      }
      const workflowData = await buildWorkflowForSave(
        state.nodes,
        state.edges,
        state.workflowDefinition,
        state.workflowMetadata,
        t,
      );
      const savedWorkflow = await updateWorkflowDefinition(workflowData);
      // R-7: no approval-enforced entity-types store in the product.
      message.success(t('workflows.builder.savedSuccessfully'));
      workflowState.setWorkflowDefinition(
        savedWorkflow as unknown as WorkflowDefinitionFull,
      );
      workflowState.setWorkflowMetadata({
        ...state.workflowMetadata,
        name: savedWorkflow.name,
        displayName: savedWorkflow.displayName || '',
        description: savedWorkflow.description,
        id: savedWorkflow.id,
        isNewWorkflow: false,
      });
      mode.enterViewMode();
      return true;
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      } else {
        message.error(String(error));
      }
      return false;
    }
  };

  const handleWorkflowMetadataUpdate = (metadata: {
    displayName: string;
    description: string;
    triggerType?: string;
  }): void => {
    workflowState.setWorkflowMetadata({
      ...state.workflowMetadata,
      name: state.workflowMetadata?.name || '',
      displayName: metadata.displayName,
      description: metadata.description,
      ...(metadata.triggerType && {
        triggerType: metadata.triggerType,
      }),
    } as WorkflowMetadata);
  };

  const performDeleteWorkflow = async (): Promise<void> => {
    if (!state.workflowMetadata?.name) {
      message.error(t('workflows.builder.workflowNameRequiredForDeletion'));
      return;
    }
    try {
      await deleteWorkflowByFqn(state.workflowMetadata.name, true);
      // R-7: no approval-enforced entity-types store in the product.
      message.success(t('workflows.builder.deletedSuccessfully'));
      void router.push({ name: 'workflows' });
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  return {
    handleNodeConfigSave,
    handleConfigSidebarClose,
    handleWorkflowFormDrawerClose,
    handleTestWorkflow,
    handleNodeClick,
    handleSaveWorkflow,
    performDeleteWorkflow,
    handleConnectionSave: edgeManagement.handleConnectionSave,
    handleConnectionCancel: edgeManagement.handleConnectionCancel,
    handleEdgeClick: edgeManagement.handleEdgeClick,
    handleEdgeDelete: edgeManagement.handleEdgeDelete,
    handleWorkflowMetadataUpdate,
    fixMissingEdgeLabels: edgeManagement.fixMissingEdgeLabels,
    fixInvalidEdgeConditions: edgeManagement.fixInvalidEdgeConditions,
  };
}
