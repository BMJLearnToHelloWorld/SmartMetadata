/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref, type ComputedRef, type Ref } from 'vue';
import type { EdgeChange, NodeChange } from '@vue-flow/core';
import { getWorkflowDefinitionByFqn } from '@/api/workflows';
import type {
  WorkflowConnection,
  WorkflowDefinitionFull,
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowNodeType,
} from '@/types/governance';
import { getWorkflowCapabilities } from '@/utils/workflowCapabilities';
import { applyFlowchartLayout } from '@/utils/workflowLayout';
import {
  createNodeData,
  generateNodeId,
  shouldShowConnectionModal,
  shouldShowForm,
  shouldUseConfigSidebar,
} from '@/utils/workflowNodeUtils';
import { deserializeWorkflow } from '@/utils/workflowSerializer';
import type { UseWorkflowStateReturn } from './useWorkflowState';

/**
 * Official useWorkflowLogic (pin a3012259ca), ported 1:1. Loads the
 * definition by fqn, deserializes + dagre-layouts it into flow nodes/edges,
 * and owns the palette drop + connect handlers.
 *
 * Two Vue adaptations:
 * - The drop position projection (`screenToFlowPosition`) lives in the
 *   canvas component, which owns the Vue Flow context — the logic
 *   composable exposes `handleDrop(type, label, flowPosition)` and the
 *   canvas projects the pointer event before calling it.
 * - Change application is local, not Vue Flow's `applyNodeChanges` /
 *   `applyEdgeChanges`: those only touch store-enriched GraphNodes
 *   (`isGraphNode` requires a `computedPosition` the plain product nodes
 *   do not carry, so position/dimension changes would silently drop) and
 *   mutate in place (the orchestrator's snapshot watcher keys on array
 *   identity). The functions below apply the same change types to the
 *   plain product nodes and return new arrays.
 */

function applyWorkflowNodeChanges(
  changes: NodeChange[],
  nodes: WorkflowFlowNode[],
): WorkflowFlowNode[] {
  let result = nodes;
  for (const change of changes) {
    if (change.type === 'remove') {
      result = result.filter((node) => node.id !== change.id);
    } else if (change.type === 'add') {
      const item = (change as { item?: unknown }).item as
        | WorkflowFlowNode
        | undefined;
      if (item && typeof item.id === 'string') {
        result = [...result, item];
      }
    } else if (change.type === 'position' && change.position) {
      const position = { ...change.position };
      result = result.map((node) =>
        node.id === change.id ? { ...node, position } : node,
      );
    } else if (change.type === 'select') {
      result = result.map((node) =>
        node.id === change.id
          ? { ...node, selected: change.selected }
          : node,
      );
    }
    // 'dimensions' has no product field (a render concern) — ignored.
  }
  return result;
}

function applyWorkflowEdgeChanges(
  changes: EdgeChange[],
  edges: WorkflowFlowEdge[],
): WorkflowFlowEdge[] {
  let result = edges;
  for (const change of changes) {
    if (change.type === 'remove') {
      result = result.filter((edge) => edge.id !== change.id);
    } else if (change.type === 'add') {
      const item = (change as { item?: unknown }).item as
        | WorkflowFlowEdge
        | undefined;
      if (item && typeof item.id === 'string') {
        result = [...result, item];
      }
    }
    // 'select'/'position' carry no product edge field — ignored.
  }
  return result;
}

// A freshly-dropped start node is only draggable once it has meaningful
// content (saved/user-modified data, a name with data assets, or a
// trigger/event/schedule configuration).
function isStartNodeConfigured(startNode: WorkflowFlowNode): boolean {
  const hasNodeContent =
    startNode.data?.lastSaved ||
    startNode.data?.userModified ||
    (startNode.data?.name && startNode.data?.dataAssets?.length > 0);
  return Boolean(
    hasNodeContent ||
      startNode.data?.triggerType ||
      startNode.data?.eventType ||
      startNode.data?.scheduleType,
  );
}

export interface UseWorkflowLogicReturn {
  loadError: Ref<Error | undefined>;
  reloadWorkflow: () => void;
  isNodeDragEnabled: (nodeType: string) => boolean;
  canDragNodes: boolean;
  onDragOver: (event: DragEvent) => void;
  onDragEnter: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  handleDrop: (
    type: string,
    label: string,
    position: { x: number; y: number },
  ) => void;
  onConnect: (connection: WorkflowConnection) => void;
}

export function useWorkflowLogic(
  workflowState: UseWorkflowStateReturn,
  options: {
    fqn?: Ref<string | undefined>;
    mode?: {
      allowStructuralGraphEdits: ComputedRef<boolean>;
      canDragNodesInViewMode: ComputedRef<boolean>;
    };
  } = {},
): UseWorkflowLogicReturn {
  const { fqn, mode } = options;
  const {
    state,
    setNodes,
    setEdges,
    setWorkflowDefinition,
    setWorkflowMetadata,
    setLoading,
    setSelectedNode,
    setIsDragging,
    updateMultipleState,
  } = workflowState;

  const loadError = ref<Error | undefined>(undefined);
  const reloadCount = ref(0);

  const fetchWorkflowDefinition = async (): Promise<void> => {
    const currentFqn = fqn?.value;
    if (!currentFqn) {
      if (!getWorkflowCapabilities().allowCreateWorkflow) {
        return;
      }
      setWorkflowMetadata({
        name: '',
        displayName: 'New Workflow',
        description: '',
        isNewWorkflow: true,
      });
      return;
    }
    try {
      setLoading(true);
      loadError.value = undefined;
      const workflowData = await getWorkflowDefinitionByFqn(
        decodeURIComponent(currentFqn),
      );
      const full = workflowData as unknown as WorkflowDefinitionFull;
      setWorkflowDefinition(full);
      // Extract and set workflow metadata from the fetched data
      if (workflowData) {
        setWorkflowMetadata({
          name: workflowData.name || '',
          displayName: workflowData.displayName || workflowData.name || '',
          description: workflowData.description || '',
          createdAt:
            workflowData.createdAt !== undefined
              ? String(workflowData.createdAt)
              : undefined,
          id: workflowData.id,
          isNewWorkflow: false,
        });
      }
      const nodes = workflowData.nodes;
      if (nodes && nodes.length > 0) {
        const { nodes: flowNodes, edges: flowEdges } =
          deserializeWorkflow(full);
        const { nodes: layoutedNodes, edges: layoutedEdges } =
          applyFlowchartLayout(flowNodes, flowEdges);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      }
    } catch (error) {
      loadError.value = error as Error;
    } finally {
      setLoading(false);
    }
  };

  void fetchWorkflowDefinition();

  const reloadWorkflow = (): void => {
    reloadCount.value += 1;
    void fetchWorkflowDefinition();
  };

  // The palette calls this with a subtype (e.g. 'checkEntityAttributesTask')
  // as well as with a node type ('startEvent'); official types the parameter
  // as NodeType but receives subtypes at runtime, and the checks below only
  // ever match the start event, so the parameter is a plain string here.
  const isNodeDragEnabled = (nodeType: string): boolean => {
    const startNode = state.nodes.find(
      (node) => node.type === 'startEvent',
    );
    if (nodeType === 'startEvent') {
      return !startNode;
    }
    if (!startNode) {
      return false;
    }
    if (fqn?.value) {
      return true;
    }
    if (state.nodes.length <= 1) {
      return isStartNodeConfigured(startNode);
    }
    return true;
  };

  const canDragNodes = true;

  // Guarded change handlers (official WorkflowCanvas guardedOnNodesChange /
  // guardedOnEdgesChange): without structural edits only selection,
  // dimensions, and view-mode position changes reach the state, and edge
  // removals are dropped entirely.
  const onNodesChange = (changes: NodeChange[]): void => {
    const allowStructural = mode?.allowStructuralGraphEdits.value ?? false;
    const allowViewDrag = mode?.canDragNodesInViewMode.value ?? false;
    const allowed = allowStructural
      ? changes
      : changes.filter(
          (change) =>
            change.type === 'select' ||
            change.type === 'dimensions' ||
            (allowViewDrag && change.type === 'position'),
        );
    if (allowed.length === 0) {
      return;
    }
    setNodes(applyWorkflowNodeChanges(allowed, state.nodes));
  };

  const onEdgesChange = (changes: EdgeChange[]): void => {
    const allowStructural = mode?.allowStructuralGraphEdits.value ?? false;
    const allowed = allowStructural
      ? changes
      : changes.filter((change) => change.type !== 'remove');
    if (allowed.length === 0) {
      return;
    }
    setEdges(applyWorkflowEdgeChanges(allowed, state.edges));
  };

  const onDragOver = (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const onDragEnter = (event: DragEvent): void => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent): void => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const isOutside =
      event.clientX <= rect.left ||
      event.clientX >= rect.right ||
      event.clientY <= rect.top ||
      event.clientY >= rect.bottom;
    if (isOutside) {
      setIsDragging(false);
    }
  };

  const handleDrop = (
    type: string,
    label: string,
    position: { x: number; y: number },
  ): void => {
    setIsDragging(false);
    if (!type) {
      return;
    }
    if (!isNodeDragEnabled(type as WorkflowNodeType)) {
      return;
    }
    const nodeId = generateNodeId(type);
    const nodeData = createNodeData(label, type, nodeId);
    // Set the proper node name using counter approach
    const existingNames = new Set(
      state.nodes.map((n) => n.data?.name).filter(Boolean),
    );
    let nodeName = '';
    if (type === 'startEvent') {
      nodeName = 'start';
    } else {
      const baseName = nodeData?.subType || nodeId;
      let counter = 1;
      nodeName = `${baseName}_${counter}`;
      while (existingNames.has(nodeName)) {
        counter++;
        nodeName = `${baseName}_${counter}`;
      }
    }
    nodeData.name = nodeName;
    const newNode: WorkflowFlowNode = {
      id: nodeId,
      type: type as WorkflowNodeType,
      position,
      data: nodeData,
    };
    setNodes((nds) => [...nds, newNode]);
    if (type === 'startEvent') {
      setSelectedNode(newNode);
      if (shouldShowForm(type)) {
        if (shouldUseConfigSidebar(type)) {
          updateMultipleState({
            isConfigSidebarOpen: true,
            isWorkflowFormDrawerOpen: false,
          });
        } else {
          updateMultipleState({
            isWorkflowFormDrawerOpen: true,
            isConfigSidebarOpen: false,
          });
        }
      }
    }
  };

  const onConnect = (connection: WorkflowConnection): void => {
    const sourceNode = state.nodes.find(
      (node) => node.id === connection.source,
    );
    const targetNode = state.nodes.find(
      (node) => node.id === connection.target,
    );
    if (shouldShowConnectionModal(sourceNode, targetNode)) {
      updateMultipleState({
        pendingConnection: connection,
        isConnectionModalOpen: true,
      });
    } else {
      // Create edge manually with duplicate prevention
      const edgeId = `reactflow__edge-${connection.source}-${connection.target}`;
      const existingEdge = state.edges.find((edge) => edge.id === edgeId);
      if (existingEdge) {
        return;
      }
      const newEdge = {
        id: edgeId,
        source: connection.source || '',
        target: connection.target || '',
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: 'default',
      };
      setEdges((eds) => [...eds, newEdge]);
    }
  };

  return {
    loadError,
    reloadWorkflow,
    isNodeDragEnabled,
    canDragNodes,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onNodesChange,
    onEdgesChange,
    handleDrop,
    onConnect,
  };
}
