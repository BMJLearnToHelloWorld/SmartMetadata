<script setup lang="ts">
/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, markRaw, ref } from 'vue';
import type { CSSProperties } from 'vue';
import {
  VueFlow,
  type Connection,
  type Edge,
  type EdgeMarker,
  type EdgeMouseEvent,
  type Node,
  type NodeMouseEvent,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { ConnectionLineType, MarkerType } from '@vue-flow/core';
import type {
  WorkflowFlowEdge,
  WorkflowFlowNode,
} from '@/types/governance';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import WorkflowCustomControls from './WorkflowCustomControls.vue';
import WorkflowEmptyCanvasMessage from './WorkflowEmptyCanvasMessage.vue';
import WorkflowStraightEdge from './WorkflowStraightEdge.vue';
import WorkflowAutomatedTaskNode from './nodes/WorkflowAutomatedTaskNode.vue';
import WorkflowEndNode from './nodes/WorkflowEndNode.vue';
import WorkflowStartNode from './nodes/WorkflowStartNode.vue';
import WorkflowUserTaskNode from './nodes/WorkflowUserTaskNode.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

/**
 * Official WorkflowCanvas (pin a3012259ca), ported to Vue Flow: the flow
 * surface with the custom straight edge, the four node renderers, guarded
 * change handlers (selection/dimensions/view-mode drag only, without
 * structural edits), dimming while a connection is focused or the condition
 * modal is open, palette drop (projected through the flow viewport), and
 * the custom controls + empty-canvas message. Structural handlers
 * (connect / drop / edge update) are only bound when structural edits are
 * enabled — never live in the OSS build.
 *
 * Vue Flow's own StraightEdge component is NOT used: official's custom
 * edge carries the clean path, condition label, and delete button.
 */

const builder = useWorkflowBuilderContext();
const { state, mode, logic, actions, edgeManagement } = builder;

const nodeTypes = {
  startEvent: markRaw(WorkflowStartNode),
  endEvent: markRaw(WorkflowEndNode),
  automatedTask: markRaw(WorkflowAutomatedTaskNode),
  userTask: markRaw(WorkflowUserTaskNode),
};
const edgeTypes = {
  straight: markRaw(WorkflowStraightEdge),
  default: markRaw(WorkflowStraightEdge),
};

// Structural subset of the VueFlow instance API, typed like LineageGraph's
// FlowApi: only the drop projection is needed here.
type FlowApi = {
  screenToFlowCoordinate: (position: {
    x: number;
    y: number;
  }) => { x: number; y: number };
};
const flowRef = ref<FlowApi | null>(null);

const isViewMode = computed(() => mode.isViewMode.value);
const allowStructuralGraphEdits = computed(
  () => mode.allowStructuralGraphEdits.value,
);
const showWorkflowNodePalette = computed(
  () => mode.showWorkflowNodePalette.value,
);
const canDragNodesInViewMode = computed(
  () => mode.canDragNodesInViewMode.value,
);

const structuralEditMode = computed(
  () => allowStructuralGraphEdits.value && !isViewMode.value,
);
const enablePaletteDrop = computed(
  () =>
    !isViewMode.value &&
    (allowStructuralGraphEdits.value || showWorkflowNodePalette.value),
);

const focusedConnection = computed(() => state.state.focusedConnection);
const pendingConnection = computed(() => state.state.pendingConnection);
const isConnectionModalOpen = computed(
  () => state.state.isConnectionModalOpen,
);

function getDimmedOpacity(
  shouldDim: boolean,
  modalOpen: boolean | undefined,
): number {
  if (!shouldDim) {
    return 1;
  }
  return modalOpen ? 0.15 : 0.3;
}

function getShouldDimEdge(edge: WorkflowFlowEdge): boolean {
  const focused = focusedConnection.value;
  if (focused) {
    return true;
  }
  if (isConnectionModalOpen.value && pendingConnection.value) {
    return !(
      edge.source === pendingConnection.value.source &&
      edge.target === pendingConnection.value.target
    );
  }
  return false;
}

function getShouldDimNode(node: WorkflowFlowNode): boolean {
  const focused = focusedConnection.value;
  if (focused) {
    return (
      node.id !== focused.sourceId && node.id !== focused.targetId
    );
  }
  if (isConnectionModalOpen.value && pendingConnection.value) {
    return (
      node.id !== pendingConnection.value.source &&
      node.id !== pendingConnection.value.target
    );
  }
  return false;
}

function getNodeCursor(): string {
  if (canDragNodesInViewMode.value) {
    return 'grab';
  }
  if (isViewMode.value) {
    return 'default';
  }
  return 'pointer';
}

function getCanvasNodeDragEnabled(): (nodeType: string) => boolean {
  if (mode.canDragNodes.value) {
    return logic.isNodeDragEnabled;
  }
  return canDragNodesInViewMode.value ? () => true : () => false;
}

const renderNodes = computed<Node[]>(() => {
  const isNodeDragEnabled = getCanvasNodeDragEnabled();
  return state.state.nodes.map((node) => {
    const isNodeDisabled =
      isNodeDragEnabled && !isNodeDragEnabled(node.type || '');
    return {
      id: node.id,
      type: node.type,
      position: node.position,
      data: { ...node.data, disabled: isNodeDisabled },
      sourcePosition: node.sourcePosition,
      targetPosition: node.targetPosition,
      draggable: node.draggable,
      selected: node.selected ?? false,
      style: {
        opacity: getDimmedOpacity(
          getShouldDimNode(node),
          isConnectionModalOpen.value,
        ),
        transition: 'opacity 0.3s ease',
        cursor: getNodeCursor(),
      },
    };
  });
});

/**
 * Convert the flow edge's loose markerEnd record into the Vue Flow
 * EdgeMarker the renderer requires: only `arrow` / `arrowclosed` are
 * produced by the edge creators, so anything else falls back to the
 * closed arrow; width/height default to 16.
 */
function toEdgeMarker(
  marker: Record<string, unknown> | undefined,
): EdgeMarker {
  const type =
    marker?.type === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed;
  const width = typeof marker?.width === 'number' ? marker.width : 16;
  const height = typeof marker?.height === 'number' ? marker.height : 16;
  const color = typeof marker?.color === 'string' ? marker.color : undefined;
  return color ? { type, width, height, color } : { type, width, height };
}

const renderEdges = computed<Edge[]>(() => {
  return state.state.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    type: edge.type || 'straight',
    label: edge.label,
    markerEnd: toEdgeMarker(edge.markerEnd),
    style: {
      strokeWidth:
        (edge.style?.strokeWidth as number | undefined) || 2,
      ...(edge.style as Record<string, unknown> | undefined),
      opacity: getDimmedOpacity(
        getShouldDimEdge(edge),
        isConnectionModalOpen.value,
      ),
      transition: 'opacity 0.3s ease',
    },
    labelStyle: {
      ...(edge.labelStyle as Record<string, unknown> | undefined),
      cursor:
        edge.data?.conditions && !isViewMode.value ? 'pointer' : 'default',
    },
    labelBgStyle: edge.labelBgStyle as CSSProperties | undefined,
    labelBgPadding: edge.labelBgPadding,
    data: {
      ...edge.data,
      onEdgeDelete: builder.handleEdgeDelete,
    },
  }));
});

function handleConnect(connection: Connection): void {
  logic.onConnect({
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
  });
}

function handleNodeClick({ event, node }: NodeMouseEvent): void {
  const stateNode = state.state.nodes.find((n) => n.id === node.id);
  if (stateNode) {
    actions.handleNodeClick(event, stateNode);
  }
}

function handleEdgeClick({ event, edge }: EdgeMouseEvent): void {
  const stateEdge = state.state.edges.find((e) => e.id === edge.id);
  if (stateEdge) {
    edgeManagement.handleEdgeClick(event, stateEdge);
  }
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  const type = event.dataTransfer?.getData('application/reactflow') ?? '';
  const label =
    event.dataTransfer?.getData('application/reactflow-label') ?? '';
  if (!type || !flowRef.value) {
    return;
  }
  const position = flowRef.value.screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  });
  logic.handleDrop(type, label, position);
}
</script>

<template>
  <div
    class="workflow-canvas"
    :class="isViewMode ? 'workflow-canvas--view' : 'workflow-canvas--edit'"
    data-testid="workflow-canvas"
    @dragover="enablePaletteDrop ? logic.onDragOver($event) : undefined"
    @dragenter="enablePaletteDrop ? logic.onDragEnter($event) : undefined"
    @dragleave="enablePaletteDrop ? logic.onDragLeave($event) : undefined"
    @drop="enablePaletteDrop ? handleDrop($event) : undefined"
  >
    <div v-if="focusedConnection" class="workflow-canvas__focus-overlay" />

    <VueFlow
      ref="flowRef"
      :nodes="renderNodes"
      :edges="renderEdges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :connection-line-type="ConnectionLineType.Straight"
      :default-edge-options="{ type: 'straight', style: { strokeWidth: 2 } }"
      :default-viewport="{ x: 0, y: 0, zoom: 0.5 }"
      :min-zoom="0.1"
      :max-zoom="2.5"
      :nodes-draggable="structuralEditMode || canDragNodesInViewMode"
      :nodes-connectable="structuralEditMode"
      :edges-updatable="structuralEditMode"
      @nodes-change="logic.onNodesChange"
      @edges-change="logic.onEdgesChange"
      @connect="structuralEditMode ? handleConnect : undefined"
      @node-click="handleNodeClick"
      @edge-click="handleEdgeClick"
    >
      <Background />
      <WorkflowCustomControls />
      <WorkflowEmptyCanvasMessage />
    </VueFlow>
  </div>
</template>

<style scoped>
.workflow-canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: var(--sm-content-bg);
}

.workflow-canvas__focus-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: rgb(0 85 135 / 0.2);
  transition: opacity 0.3s ease;
}
</style>
