/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ComputedRef } from 'vue';
import type {
  WorkflowConnection,
  WorkflowConnectionCondition,
  WorkflowFlowEdge,
} from '@/types/governance';
import {
  getWorkflowConditionTheme,
  WORKFLOW_EDGE_THEME,
} from '@/utils/workflowEdgeTheme';
import type { WorkflowBuilderState } from './useWorkflowState';

/**
 * Official useWorkflowEdgeManagement (pin a3012259ca), ported 1:1: edge
 * condition repair (data-completeness quality bands), missing-label repair,
 * connection save/cancel, edge click (opens the condition modal in edit
 * mode; inert in view mode), and edge delete.
 *
 * The modal position in official is read from the target node's DOM rect
 * (`[data-id]`); the Vue port reads the same rect from the Vue Flow canvas
 * (`.vue-flow__node[data-id]`).
 */

const EDGE_LABEL_STYLE = {
  fontSize: '14px',
  fontWeight: 600,
  letterSpacing: '1px',
  cursor: 'pointer',
} as const;

export interface UseWorkflowEdgeManagementReturn {
  fixInvalidEdgeConditions: (
    updatedNodeId: string,
    newQualityBands: unknown[],
  ) => void;
  fixMissingEdgeLabels: () => void;
  handleConnectionSave: (
    connection: WorkflowConnection,
    conditions: WorkflowConnectionCondition[],
  ) => void;
  handleConnectionCancel: () => void;
  handleEdgeClick: (event: MouseEvent, edge: WorkflowFlowEdge) => void;
  handleEdgeDelete: (edgeId: string) => void;
}

export function useWorkflowEdgeManagement(
  state: WorkflowBuilderState,
  isViewMode: ComputedRef<boolean>,
): UseWorkflowEdgeManagementReturn {
  const setEdges = (
    updater:
      | WorkflowFlowEdge[]
      | ((prev: WorkflowFlowEdge[]) => WorkflowFlowEdge[]),
  ): void => {
    state.edges =
      typeof updater === 'function' ? updater(state.edges) : updater;
  };

  const fixInvalidEdgeConditions = (
    updatedNodeId: string,
    newQualityBands: unknown[],
  ): void => {
    if (!newQualityBands || newQualityBands.length === 0) {
      return;
    }
    const validConditionValues = new Set(
      (newQualityBands as { name?: string }[]).map(
        (band) => band.name?.toLowerCase() || band.name,
      ),
    );
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        if (edge.source !== updatedNodeId) {
          return edge;
        }
        const currentCondition = edge.data?.condition || edge.label;
        if (currentCondition && !validConditionValues.has(currentCondition)) {
          const firstBand = (newQualityBands as { name?: string }[])[0];
          const newCondition = firstBand.name?.toLowerCase() || firstBand.name;
          const newLabel = firstBand.name;
          const { backgroundColor, labelColor } = getWorkflowConditionTheme(
            newCondition ?? '',
          );
          return {
            ...edge,
            label: newLabel,
            data: {
              ...edge.data,
              conditions: [
                {
                  field: 'result',
                  operator: 'equals',
                  value: newCondition,
                },
              ],
              condition: newCondition,
            },
            style: {
              stroke: labelColor,
              strokeWidth: 2,
            },
            labelStyle: {
              color: labelColor,
              ...EDGE_LABEL_STYLE,
            },
            labelBgStyle: {
              fill: backgroundColor,
              fillOpacity: 1,
              stroke: WORKFLOW_EDGE_THEME.labelBorder,
              strokeWidth: 2,
              rx: 5,
              ry: 5,
            },
          };
        }
        return edge;
      }),
    );
  };

  const fixEdgeLabel = (edge: WorkflowFlowEdge): WorkflowFlowEdge => {
    const sourceNode = state.nodes.find((n) => n.id === edge.source);
    if (
      edge.label &&
      typeof edge.label === 'string' &&
      edge.label.trim() !== ''
    ) {
      return edge;
    }
    if (
      sourceNode?.data?.subType === 'userApprovalTask' ||
      sourceNode?.data?.subType === 'checkEntityAttributesTask' ||
      sourceNode?.data?.subType === 'checkChangeDescriptionTask' ||
      sourceNode?.data?.subType === 'dataCompletenessTask'
    ) {
      return {
        ...edge,
        label: 'TRUE',
        data: {
          ...edge.data,
          conditions: [
            {
              field: 'result',
              operator: 'equals',
              value: 'TRUE',
            },
          ],
          condition: 'TRUE',
        },
        style: {
          stroke: WORKFLOW_EDGE_THEME.positiveLabel,
          strokeWidth: 2,
        },
        labelStyle: {
          color: WORKFLOW_EDGE_THEME.positiveLabel,
          ...EDGE_LABEL_STYLE,
        },
        labelBgStyle: {
          fill: WORKFLOW_EDGE_THEME.positiveBackground,
          fillOpacity: 1,
          stroke: WORKFLOW_EDGE_THEME.labelBorder,
          strokeWidth: 2,
          rx: 5,
          ry: 5,
        },
      };
    }
    return edge;
  };

  const fixMissingEdgeLabels = (): void => {
    setEdges((currentEdges) => currentEdges.map(fixEdgeLabel));
  };

  const handleConnectionSave = (
    connection: WorkflowConnection,
    conditions: WorkflowConnectionCondition[],
  ): void => {
    const conditionLabel =
      conditions.length === 1
        ? conditions[0].value
        : `${conditions.length} conditions`;
    if (!connection.source || !connection.target) {
      return;
    }
    const { backgroundColor, labelColor } =
      getWorkflowConditionTheme(conditionLabel);
    const edgeId = `reactflow__edge-${connection.source}-${connection.target}`;
    const newEdge: WorkflowFlowEdge = {
      id: edgeId,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      type: 'straight',
      label: conditionLabel,
      markerEnd: {
        type: 'arrowclosed',
        width: 16,
        height: 16,
        color: WORKFLOW_EDGE_THEME.edge,
      },
      data: {
        conditions,
        condition: conditionLabel,
      },
      style: {
        stroke: WORKFLOW_EDGE_THEME.edge,
        strokeWidth: 2,
      },
      labelStyle: {
        color: labelColor,
        ...EDGE_LABEL_STYLE,
      },
      labelBgStyle: {
        fill: backgroundColor,
        fillOpacity: 1,
        stroke: WORKFLOW_EDGE_THEME.labelBorder,
        strokeWidth: 2,
        rx: 5,
        ry: 5,
      },
    };
    if (state.editingEdge) {
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === state.editingEdge?.id ? newEdge : edge,
        ),
      );
      state.editingEdge = null;
    } else {
      const existingEdge = state.edges.find((edge) => edge.id === newEdge.id);
      if (existingEdge) {
        state.isConnectionModalOpen = false;
        state.pendingConnection = null;
        state.focusedConnection = null;
        return;
      }
      setEdges((eds) => [...eds, newEdge]);
    }
    state.isConnectionModalOpen = false;
    state.pendingConnection = null;
    state.focusedConnection = null;
  };

  const handleConnectionCancel = (): void => {
    state.isConnectionModalOpen = false;
    state.pendingConnection = null;
    state.focusedConnection = null;
    state.editingEdge = null;
  };

  const handleEdgeClick = (event: MouseEvent, edge: WorkflowFlowEdge): void => {
    event.stopPropagation();
    if (isViewMode.value) {
      return;
    }
    if (!edge.data?.conditions) {
      return;
    }
    const targetNode = state.nodes.find((node) => node.id === edge.target);
    if (targetNode) {
      const nodeElement = document.querySelector(
        `[data-id="${targetNode.id}"]`,
      );
      if (nodeElement) {
        const nodeRect = nodeElement.getBoundingClientRect();
        state.modalPosition = {
          x: nodeRect.left - 10,
          y: nodeRect.top - 35,
        };
      }
    }
    state.editingEdge = edge;
    state.pendingConnection = {
      source: edge.source,
      target: edge.target,
      sourceHandle: null,
      targetHandle: null,
    };
    state.isConnectionModalOpen = true;
    state.focusedConnection = {
      sourceId: edge.source,
      targetId: edge.target,
    };
  };

  const handleEdgeDelete = (edgeId: string): void => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
  };

  return {
    fixInvalidEdgeConditions,
    fixMissingEdgeLabels,
    handleConnectionSave,
    handleConnectionCancel,
    handleEdgeClick,
    handleEdgeDelete,
  };
}
