<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, markRaw, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Select, Space, Tooltip, message } from 'ant-design-vue';
import { SM_COLOR_WARNING, SM_SURFACES } from '@/theme/tokens';
import { MarkerType, VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import type { Connection, Edge, Node } from '@vue-flow/core';
import { columnBelongsToNode, columnLineageEdges } from '@/lineage/columnPorts';
import { filterCanvasNodes } from '@/lineage/nodeChrome';
import {
  layoutLineageGraph,
  lineageNodeNeighbors,
  lineageNodeSide,
  type LineageGraphModel,
  type LineageGraphNode,
} from '@/lineage/graphModel';
import LineageNode, { type LineageNodeData } from './LineageNode.vue';
import { captureLineagePng, lineagePngFileName } from '@/lineage/exportPng';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

const props = withDefaults(
  defineProps<{
    model: LineageGraphModel;
    variant?: 'page' | 'tab';
    highlightedColumnFqns?: string[];
    highlightedNodeIds?: string[];
    highlightedEdgeIds?: string[];
    /** ColumnLevelLineage layer: show every column edge, not only expanded nodes'. */
    forceColumnEdges?: boolean;
    /** Edge mode labels edges by pipeline name when one exists. */
    pipelineViewMode?: 'Node' | 'Edge';
    /** DQ lineage nodes/edges (pin dqHighlightedEdges + showDqTracing). */
    dqNodeIds?: string[];
    dqEdgeIds?: string[];
    /** Nodes whose children were loaded in a direction (pin expandPerformed). */
    expandedUpstreamIds?: string[];
    expandedDownstreamIds?: string[];
  }>(),
  {
    variant: 'page',
    highlightedColumnFqns: () => [],
    highlightedNodeIds: () => [],
    highlightedEdgeIds: () => [],
    forceColumnEdges: false,
    pipelineViewMode: 'Node',
    dqNodeIds: () => [],
    dqEdgeIds: () => [],
    expandedUpstreamIds: () => [],
    expandedDownstreamIds: () => [],
  },
);

const emit = defineEmits<{
  navigate: [node: LineageGraphNode];
  'select-node': [node: LineageGraphNode];
  connect: [payload: { from: LineageGraphNode; to: LineageGraphNode }];
  'expand-children': [payload: { node: LineageGraphNode; direction: 'upstream' | 'downstream' }];
  'collapse-children': [payload: { node: LineageGraphNode; direction: 'upstream' | 'downstream' }];
}>();

const { t } = useI18n();
const expandedIds = ref<string[]>([]);
const selectedNodeId = ref<string | undefined>();
const fullscreen = ref(false);
const layoutNonce = ref(0);
/** Per-node "columns with lineage only" filter (pin nodeFilterState). */
const columnsLineageOnlyIds = ref<string[]>([]);

const nodeTypes = {
  asset: markRaw(LineageNode),
};

const expandedSet = computed(() => new Set(expandedIds.value));

const positioned = computed(() => {
  layoutNonce.value;
  return layoutLineageGraph(props.model, expandedSet.value);
});

function toggleExpand(nodeId: string): void {
  expandedIds.value = expandedIds.value.includes(nodeId)
    ? expandedIds.value.filter((id) => id !== nodeId)
    : [...expandedIds.value, nodeId];
}

const nodes = computed<Node<LineageNodeData>[]>(() =>
  positioned.value.nodes.map((node) => {
    const neighbors = lineageNodeNeighbors(props.model, node.id);
    return {
      id: node.id,
      type: 'asset',
      position: node.position,
      draggable: true,
      data: {
        ...node,
        expanded: expandedSet.value.has(node.id),
        highlighted: props.highlightedNodeIds.includes(node.id) || selectedNodeId.value === node.id,
        highlightedColumns: props.highlightedColumnFqns,
        onToggleColumns: () => toggleExpand(node.id),
        hasUpstream: neighbors.hasUpstream,
        hasDownstream: neighbors.hasDownstream,
        side: lineageNodeSide(props.model, node.id),
        expandedUpstream: props.expandedUpstreamIds.includes(node.id),
        expandedDownstream: props.expandedDownstreamIds.includes(node.id),
        columnsLineageOnly: columnsLineageOnlyIds.value.includes(node.id),
        lineageColumnFqns: lineageColumnsByNode.value.get(node.id) ?? [],
        dqTraced: props.dqNodeIds.includes(node.id),
        onExpandChildren: (direction) => emit('expand-children', { node, direction }),
        onCollapseChildren: (direction) => emit('collapse-children', { node, direction }),
        onToggleColumnsLineageOnly: () => toggleColumnsLineageOnly(node.id),
      },
    };
  }),
);

/** Column FQNs per node that carry lineage (the columns-only filter's allow-list). */
const lineageColumnsByNode = computed(() => {
  const byNode = new Map<string, string[]>();
  const seen = new Map<string, Set<string>>();
  const add = (nodeId: string, columnFqn: string): void => {
    const node = props.model.nodes.find((item) => item.id === nodeId);
    if (!node || !columnFqn || !columnBelongsToNode(columnFqn, node.fullyQualifiedName)) {
      return;
    }
    const set = seen.get(nodeId) ?? new Set<string>();
    if (!set.has(columnFqn)) {
      set.add(columnFqn);
      seen.set(nodeId, set);
      byNode.set(nodeId, [...set]);
    }
  };
  for (const edge of props.model.edges) {
    for (const mapping of edge.columnMappings) {
      for (const from of mapping.fromColumns) {
        add(edge.source, from);
      }
      if (mapping.toColumn) {
        add(edge.target, mapping.toColumn);
      }
    }
  }
  return byNode;
});

function toggleColumnsLineageOnly(nodeId: string): void {
  columnsLineageOnlyIds.value = columnsLineageOnlyIds.value.includes(nodeId)
    ? columnsLineageOnlyIds.value.filter((id) => id !== nodeId)
    : [...columnsLineageOnlyIds.value, nodeId];
}

const visibleColumnEdges = computed(() =>
  columnLineageEdges(props.model).filter(
    (edge) =>
      props.forceColumnEdges ||
      expandedSet.value.has(edge.source) ||
      expandedSet.value.has(edge.target),
  ),
);

const edges = computed<Edge[]>(() => {
  const entityEdges = props.model.edges.map((edge) => {
    const highlighted =
      props.highlightedEdgeIds.includes(edge.id) || props.dqEdgeIds.includes(edge.id);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label:
        props.pipelineViewMode === 'Edge' && edge.pipelineName
          ? edge.pipelineName
          : edge.label || undefined,
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
      class: highlighted ? 'lineage-edge--active' : undefined,
      style: {
        stroke: highlighted ? SM_COLOR_WARNING : SM_SURFACES.textQuaternary,
        strokeWidth: highlighted ? 2.5 : 2,
      },
    };
  });
  const columnEdges = visibleColumnEdges.value.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label || undefined,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
    class: 'lineage-edge--column',
    style: {
      // Q-TH-4: read the managed CSS variable so a custom theme
      // primary color reaches column edges (Vue Flow applies this
      // style to the SVG path, where the variable resolves live).
      stroke: 'var(--sm-color-primary)',
      strokeWidth: 1.75,
      strokeDasharray: '5 4',
    },
  }));
  return [...entityEdges, ...columnEdges];
});

const nodeOptions = computed(() =>
  filterCanvasNodes(props.model.nodes, '').map((node) => ({
    value: node.id,
    label: node.displayName || node.name,
  })),
);

function onNodeClick(payload: { node: Node<LineageNodeData> }): void {
  if (payload.node.data) {
    selectedNodeId.value = payload.node.data.id;
    emit('select-node', payload.node.data);
    emit('navigate', payload.node.data);
  }
}

function onConnect(connection: Connection): void {
  const sourceId = connection.source;
  const targetId = connection.target;
  if (!sourceId || !targetId || sourceId === targetId) {
    return;
  }
  const from = props.model.nodes.find((node) => node.id === sourceId);
  const to = props.model.nodes.find((node) => node.id === targetId);
  if (
    !from ||
    !to ||
    !from.entityType ||
    !from.fullyQualifiedName ||
    !to.entityType ||
    !to.fullyQualifiedName
  ) {
    return;
  }
  emit('connect', { from, to });
}

function onFindNode(value: unknown): void {
  const id = typeof value === 'string' ? value : '';
  const node = props.model.nodes.find((item) => item.id === id);
  selectedNodeId.value = id || undefined;
  if (node) {
    emit('select-node', node);
  }
}

function resetLayout(): void {
  expandedIds.value = [];
  layoutNonce.value += 1;
}

function toggleFullscreen(): void {
  fullscreen.value = !fullscreen.value;
}

// Structural subset of the VueFlow instance API (fitView/getViewport/
// setViewport are exposed by @vue-flow/core's VueFlow component); typed
// structurally so this file does not depend on the component's full type.
type FlowApi = {
  getViewport: () => { x: number; y: number; zoom: number };
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  fitView: (options?: { padding?: number }) => Promise<boolean>;
  $el: HTMLElement;
};

const flowRef = ref<FlowApi | null>(null);

/**
 * Full-graph PNG export, exposed to LineageCanvas. Mirrors the official
 * beforeCapture/afterCapture shape: save the viewport, fit the whole graph
 * into the container, capture the `.vue-flow` element, then restore the
 * viewport the user had. Throws when the flow is not mounted (e.g. the
 * diagram tab is not active); the caller surfaces the failure.
 */
async function exportPng(entityType: string, fqn: string): Promise<void> {
  const flow = flowRef.value;
  if (!flow) {
    throw new Error('Lineage flow is not mounted');
  }
  const saved = flow.getViewport();
  try {
    await flow.fitView({ padding: 0.1 });
    await nextTick();
    const element = flow.$el?.querySelector?.('.vue-flow') as HTMLElement | null;
    const target = element ?? (flow.$el as HTMLElement | null);
    if (!target) {
      throw new Error('Lineage flow element not found');
    }
    await captureLineagePng(target, lineagePngFileName(entityType, fqn));
    message.success(t('lineage.exportPngDone'));
  } finally {
    flow.setViewport(saved);
  }
}

defineExpose({ exportPng });

watch(
  () => props.model.centerId,
  () => {
    expandedIds.value = [];
    columnsLineageOnlyIds.value = [];
    selectedNodeId.value = undefined;
    layoutNonce.value += 1;
  },
);
</script>

<template>
  <div
    class="lineage-graph"
    :class="[
      `lineage-graph--${variant}`,
      'lineage-graph--om-chrome',
      { 'lineage-graph--fullscreen': fullscreen },
    ]"
    data-testid="lineage-graph"
  >
    <div class="lineage-graph__toolbar">
      <Space wrap align="center">
        <span class="lineage-graph__hint" data-testid="lineage-connect-hint">{{ t('lineage.connectHelp') }}</span>
        <Select
          :value="selectedNodeId"
          allow-clear
          show-search
          option-filter-prop="label"
          class="lineage-graph__find"
          data-testid="lineage-find-node"
          :options="nodeOptions"
          :placeholder="t('lineage.findNode')"
          @update:value="onFindNode"
        />
        <Tooltip :title="t('lineage.resetLayoutHelp')">
          <Button data-testid="lineage-reset-layout" :aria-label="t('lineage.resetLayoutHelp')" @click="resetLayout">
            {{ t('lineage.resetLayout') }}
          </Button>
        </Tooltip>
        <Tooltip :title="t('lineage.fullscreenHelp')">
          <Button
            data-testid="lineage-fullscreen"
            :aria-label="t('lineage.fullscreenHelp')"
            @click="toggleFullscreen"
          >
            {{ fullscreen ? t('lineage.exitFullscreen') : t('lineage.fullscreen') }}
          </Button>
        </Tooltip>
      </Space>
    </div>
    <VueFlow
      ref="flowRef"
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :nodes-draggable="true"
      :nodes-connectable="true"
      fit-view-on-init
      :min-zoom="0.3"
      :max-zoom="2"
      @node-click="onNodeClick"
      @connect="onConnect"
    >
      <Background :color="SM_SURFACES.borderSecondary" :gap="18" :size="1" />
      <Controls />
      <MiniMap pannable zoomable />
    </VueFlow>
  </div>
</template>

<style scoped>
.lineage-graph {
  display: flex;
  flex-direction: column;
  min-height: 420px;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card);
  background: var(--sm-content-bg);
}
.lineage-graph--page {
  flex: 1 1 auto;
  min-height: calc(100vh - 220px);
}
.lineage-graph--tab {
  height: 420px;
  min-height: 420px;
}
/* Fullscreen page surface: modal tier of the official z ladder (1500) —
 * the ladder has no fullscreen tier; modal is the tier above Ant's 1000
 * modal/drawer and the 1050 overlay, below popover 2000. The previous
 * 1100 was off-ladder. */
.lineage-graph--fullscreen {
  position: fixed;
  inset: 0;
  z-index: var(--sm-z-modal);
  height: 100vh;
  min-height: 100vh;
  border-radius: 0;
  background: var(--sm-content-bg);
}
.lineage-graph__toolbar {
  padding: 8px 10px;
  border-bottom: 1px solid var(--sm-border-secondary);
  background: var(--sm-bg-container);
}
.lineage-graph__find {
  min-width: 220px;
}
.lineage-graph__hint {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.lineage-graph :deep(.vue-flow) {
  flex: 1 1 auto;
  min-height: 0;
}
.lineage-graph :deep(.vue-flow__edge-path) {
  stroke-linecap: round;
}
.lineage-graph :deep(.lineage-edge--active .vue-flow__edge-path) {
  stroke: var(--sm-color-warning);
}
.lineage-graph :deep(.lineage-edge--column .vue-flow__edge-path) {
  stroke: var(--sm-color-primary);
}
.lineage-graph :deep(.vue-flow__controls) {
  overflow: hidden;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  box-shadow: var(--sm-shadow-card);
}
.lineage-graph :deep(.vue-flow__controls-button) {
  width: 28px;
  height: 28px;
  border-color: var(--sm-border-secondary);
  background: var(--sm-bg-container);
}
.lineage-graph :deep(.vue-flow__controls-button:hover) {
  background: var(--sm-color-primary-bg);
}
.lineage-graph :deep(.vue-flow__minimap) {
  overflow: hidden;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
}
</style>
