<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, markRaw, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Space, message } from 'ant-design-vue';
import { SM_COLOR_WARNING, SM_SURFACES } from '@/theme/tokens';
import { MarkerType, Panel, VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { MiniMap } from '@vue-flow/minimap';
import type { Connection, Edge, Node, NodeComponent, NodeMouseEvent, NodeTypesObject } from '@vue-flow/core';
import { columnBelongsToNode, columnLineageEdges } from '@/lineage/columnPorts';
import type { LineageLayer } from '@/lineage/config';
import {
  type LineageEntityContext,
  type LineagePlatformView,
} from '@/lineage/layers';
import {
  layoutLineageGraph,
  lineageNodeNeighbors,
  lineageNodeSide,
  lineageNodeSize,
  type LineageGraphEdge,
  type LineageGraphModel,
  type LineageGraphNode,
  type PositionedLineageGraph,
} from '@/lineage/graphModel';
import LineageLayers from './LineageLayers.vue';
import LineageNode, { type LineageNodeData } from './LineageNode.vue';
import LineageZoomControls from './LineageZoomControls.vue';
import { captureLineagePng, lineagePngFileName } from '@/lineage/exportPng';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
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
    /**
     * Pin `canEdit` (`EntityLineageCanvas`): editing (drag-connect, node
     * menus, delete) is off without edit access, on a platform view, or
     * for a service entity. The canvas computes it; the graph only
     * renders it.
     */
    canEdit?: boolean;
    /** Focus entity type (Layers panel gating). */
    entityType?: string;
    /** Focus entity context (Layers panel gating + platform views). */
    entityContext?: LineageEntityContext;
    /** Layers-panel state, from the lineage store. */
    activeLayer?: LineageLayer[];
    platformView?: LineagePlatformView;
    /**
     * Fullscreen, driven by the canvas header (pin `Lineage.tsx`: the
     * `fullscreen` URL param). The graph no longer owns a fullscreen
     * toggle of its own.
     */
    fullscreen?: boolean;
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
    canEdit: true,
    entityType: '',
    entityContext: undefined,
    activeLayer: () => [],
    platformView: 'None',
    fullscreen: false,
  },
);

const emit = defineEmits<{
  /** Pin `Lineage.tsx:1599-1621`: a node click opens the drawer. */
  'open-node': [node: LineageGraphNode];
  'select-node': [node: LineageGraphNode];
  connect: [payload: { from: LineageGraphNode; to: LineageGraphNode }];
  'expand-children': [payload: { node: LineageGraphNode; direction: 'upstream' | 'downstream' }];
  'collapse-children': [payload: { node: LineageGraphNode; direction: 'upstream' | 'downstream' }];
  'select-edge': [selection: LineageEdgeSelection];
  'edit-lineage': [payload: { node: LineageGraphNode; direction: 'upstream' | 'downstream'; columnFqn?: string }];
  'delete-node': [node: LineageGraphNode];
  'delete-edge': [selection: LineageEdgeSelection];
  'change-active-layer': [layers: LineageLayer[]];
  'change-platform-view': [view: LineagePlatformView];
}>();

/** A selected edge: an entity edge, or one column mapping of an entity edge. */
export interface LineageEdgeSelection {
  edge: LineageGraphEdge;
  isColumnEdge: boolean;
  /** Column endpoints (column edges only). */
  sourceHandle?: string;
  targetHandle?: string;
}

const { t } = useI18n();
const expandedIds = ref<string[]>([]);
const selectedNodeId = ref<string | undefined>();
const selectedEdge = ref<LineageEdgeSelection | undefined>();
const zoom = ref(1);
const miniMapVisible = ref(true);
/** Per-node "columns with lineage only" filter (pin nodeFilterState). */
const columnsLineageOnlyIds = ref<string[]>([]);

/**
 * Custom node type registration. LineageNode takes LineageNodeData props,
 * not Vue Flow's NodeProps, so the cast asserts it satisfies the node
 * contract Vue Flow calls at runtime (verified by LineageGraph tests,
 * which render the stubbed flow with these node types).
 */
const nodeTypes: NodeTypesObject = {
  asset: markRaw(LineageNode) as unknown as NodeComponent,
};

const expandedSet = computed(() => new Set(expandedIds.value));

/**
 * ELK layout is async (pin `Lineage.tsx`: the reposition awaits
 * `positionNodesUsingElk`), so positions arrive in a ref, not a computed.
 * The run id drops stale results when the model changes mid-layout; a
 * re-layout for an expand toggle keeps the previous positions until the
 * new ones resolve, while a new center clears them. The first layout of a
 * model fits the view once — `fit-view-on-init` cannot see nodes that
 * arrive after mount.
 */
const positioned = ref<PositionedLineageGraph | undefined>();
const layoutRunId = ref(0);
let lastLayoutCenterId = '';

async function runLayout(fitAfter: boolean): Promise<void> {
  const run = ++layoutRunId.value;
  const result = await layoutLineageGraph(props.model, expandedSet.value);
  if (run !== layoutRunId.value) {
    return;
  }
  positioned.value = result;
  if (fitAfter && flowRef.value) {
    await nextTick();
    await flowRef.value.fitView({ padding: 0.1 });
  }
}

watch(
  [() => props.model, expandedSet],
  () => {
    const centerChanged = props.model.centerId !== lastLayoutCenterId;
    if (centerChanged) {
      lastLayoutCenterId = props.model.centerId;
      positioned.value = undefined;
    }
    void runLayout(centerChanged);
  },
  { immediate: true },
);

function toggleExpand(nodeId: string): void {
  expandedIds.value = expandedIds.value.includes(nodeId)
    ? expandedIds.value.filter((id) => id !== nodeId)
    : [...expandedIds.value, nodeId];
}

const nodes = computed<Node<LineageNodeData>[]>(() =>
  (positioned.value?.nodes ?? []).map((node) => {
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
        isNodeEditable: props.canEdit,
        canDeleteNode: props.canEdit && !node.isCenter,
        // Pin `LineageNodeLabelV1:180-191`: the node name is a link-style
        // button that opens the node detail drawer.
        onOpenEntity: () => openNode(node),
        onEditLineage: (direction, columnFqn) =>
          emit('edit-lineage', { node, direction, ...(columnFqn ? { columnFqn } : {}) }),
        onDeleteNode: () => emit('delete-node', node),
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
  // Nodes arrive from the async ELK layout; while `positioned` is
  // undefined the node list is empty, and Vue Flow silently drops edges
  // whose endpoints are not in the store — and never re-adds them when
  // only the nodes change, because this computed's reference never
  // changes. Gate on `positioned` so nodes and edges reach Vue Flow in
  // the same update: the first paint shows the whole graph, not nodes
  // with 0 edges until some later recompute (e.g. expanding columns).
  if (!positioned.value) {
    return [];
  }
  const entityEdges = props.model.edges.map((edge) => {
    const highlighted =
      props.highlightedEdgeIds.includes(edge.id) ||
      props.dqEdgeIds.includes(edge.id) ||
      selectedEdge.value?.edge.id === edge.id;
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
      data: { isColumnEdge: false },
      style: {
        // PNG export: html-to-image deep-copies the edges <svg> without
        // applying computed styles, so Vue Flow's stylesheet-only
        // `fill: none` is lost and the open smoothstep path renders as a
        // solid black fill in the PNG. Inline it so the export keeps a
        // stroke-only path (repro: work/lineage-png-bug/REPORT.md §4).
        fill: 'none',
        stroke: highlighted ? SM_COLOR_WARNING : SM_SURFACES.textQuaternary,
        strokeWidth: highlighted ? 2.5 : 2,
      },
      // Same export mechanism: the label background rect's `fill: white`
      // is also stylesheet-only; without it the rect renders black and
      // hides the black label text. Inline it via Vue Flow's labelBgStyle.
      labelBgStyle: { fill: 'white' },
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
    data: { isColumnEdge: true, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle },
    style: {
      // Q-TH-4: read the managed CSS variable so a custom theme
      // primary color reaches column edges (Vue Flow applies this
      // style to the SVG path, where the variable resolves live).
      // `fill: 'none'` is inlined for the same PNG-export reason as the
      // entity edges above: the stylesheet-only fill is lost in export.
      fill: 'none',
      stroke: 'var(--sm-color-primary)',
      strokeWidth: 1.75,
      strokeDasharray: '5 4',
    },
    labelBgStyle: { fill: 'white' },
  }));
  return [...entityEdges, ...columnEdges];
});

/**
 * Pin `Lineage.tsx:1599-1621` (`onNodeClick`): a node click opens the
 * node detail drawer. The click also keeps the canvas selection (it
 * drives Delete/Backspace), and clicks on controls inside the card —
 * buttons, inputs, links, handles, the column list — are excluded so
 * they keep their own actions (the name button opens the drawer via
 * `onOpenEntity` and stops propagation there).
 */
function openNode(node: LineageGraphNode): void {
  selectedNodeId.value = node.id;
  emit('select-node', node);
  emit('open-node', node);
}

function onNodeClick(payload: { event?: Event; node: Node<LineageNodeData> }): void {
  const target = payload.event?.target as HTMLElement | undefined;
  if (
    target?.closest?.('button, input, a, .vue-flow__handle, .lineage-node__columns')
  ) {
    return;
  }
  if (payload.node.data) {
    openNode(payload.node.data);
  }
}

/**
 * Pin `onNodeContextMenu` (EntityLineagePureUtils.ts:77-82): right-click on
 * a node only suppresses the browser menu — pin opens no menu there (the
 * node options live in the ⋮ dropdown, LineageNodeMenu). Wired on the
 * classic canvas only, as in pin (EntityLineageCanvas.tsx:324); the scene
 * map does not wire it.
 */
function onNodeContextMenu(payload: NodeMouseEvent): void {
  payload.event.preventDefault();
}

/**
 * Edge click selects (never navigates): pin `onEdgeClick` opens the edge
 * drawer; the product has no drawer, so the click only selects — the
 * selection drives Delete/Backspace and the toolbar delete button. A
 * column edge selects its parent entity edge plus the column pair.
 */
function onEdgeClick(payload: { edge: Edge }): void {
  const edge = payload.edge;
  const data = (edge.data ?? {}) as { isColumnEdge?: boolean; sourceHandle?: string; targetHandle?: string };
  if (data.isColumnEdge) {
    const parent = props.model.edges.find(
      (item) => item.source === edge.source && item.target === edge.target,
    );
    if (!parent) {
      return;
    }
    selectedEdge.value = {
      edge: parent,
      isColumnEdge: true,
      ...(data.sourceHandle ? { sourceHandle: data.sourceHandle } : {}),
      ...(data.targetHandle ? { targetHandle: data.targetHandle } : {}),
    };
  } else {
    const found = props.model.edges.find((item) => item.id === edge.id);
    if (!found) {
      return;
    }
    selectedEdge.value = { edge: found, isColumnEdge: false };
  }
  emit('select-edge', selectedEdge.value);
}

/** Selected edge endpoints, for the toolbar delete button. */
const selectedEdgeLabel = computed(() => {
  const selection = selectedEdge.value;
  if (!selection) {
    return '';
  }
  const from = props.model.nodes.find((node) => node.id === selection.edge.source);
  const to = props.model.nodes.find((node) => node.id === selection.edge.target);
  const fromName = from?.displayName || from?.name || selection.edge.source;
  const toName = to?.displayName || to?.name || selection.edge.target;
  return t('lineage.selectedEdge', { from: fromName, to: toName });
});

function onDeleteSelectedEdge(): void {
  if (selectedEdge.value) {
    emit('delete-edge', selectedEdge.value);
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

// Structural subset of the VueFlow instance API (fitView/getViewport/
// setViewport/zoomIn/zoomOut/setCenter are exposed by @vue-flow/core's
// VueFlow component); typed structurally so this file does not depend on
// the component's full type.
type FlowApi = {
  getViewport: () => { x: number; y: number; zoom: number };
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  fitView: (options?: { padding?: number; maxZoom?: number }) => Promise<boolean>;
  zoomIn: (options?: { duration?: number }) => Promise<boolean>;
  zoomOut: (options?: { duration?: number }) => Promise<boolean>;
  setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void;
  $el: HTMLElement;
};

const flowRef = ref<FlowApi | null>(null);

function syncZoom(): void {
  const viewport = flowRef.value?.getViewport?.();
  if (viewport) {
    zoom.value = viewport.zoom;
  }
}

async function onZoomIn(): Promise<void> {
  await flowRef.value?.zoomIn?.();
  syncZoom();
}

async function onZoomOut(): Promise<void> {
  await flowRef.value?.zoomOut?.();
  syncZoom();
}

/**
 * Pin `LineageControlButtons` fit: `fitView({ padding: 0.2,
 * maxZoom: 1 })` (`EntityLineageCanvas.tsx:72`).
 */
async function onFitView(): Promise<void> {
  await flowRef.value?.fitView?.({ padding: 0.2, maxZoom: 1 });
  syncZoom();
}

function onMoveEnd(payload: unknown): void {
  const record = payload as { flowTransform?: { zoom?: number }; zoom?: number } | null;
  const nextZoom = record?.flowTransform?.zoom ?? record?.zoom;
  if (typeof nextZoom === 'number') {
    zoom.value = nextZoom;
  }
}

/**
 * Pin `LineageSearchSelect` centering: `setCenter` on the node's
 * rendered center (`ZOOM_TRANSITION_DURATION` 800ms) at the current
 * zoom. Returns false when the node is not on the canvas. Exposed
 * for the tab-header search.
 */
function centerOnNode(nodeId: string): boolean {
  const flow = flowRef.value;
  const positionedNode = positioned.value?.nodes.find((item) => item.id === nodeId);
  if (!flow || !positionedNode) {
    return false;
  }
  const size = lineageNodeSize(positionedNode, expandedSet.value);
  flow.setCenter(
    positionedNode.position.x + size.width / 2,
    positionedNode.position.y + size.height / 2,
    { zoom: flow.getViewport().zoom, duration: 800 },
  );
  return true;
}

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

defineExpose({ exportPng, centerOnNode });

watch(
  () => props.model.centerId,
  () => {
    expandedIds.value = [];
    columnsLineageOnlyIds.value = [];
    selectedNodeId.value = undefined;
    selectedEdge.value = undefined;
    // The model watch re-lays out for the new center; no nonce bump here
    // (it would only start a second, discarded layout run).
  },
);

/**
 * A deleted edge leaves the model on refetch; drop a selection that no
 * longer names an edge, so the toolbar delete button cannot fire twice.
 */
watch(
  () => props.model.edges,
  (edges) => {
    if (
      selectedEdge.value &&
      !edges.some((edge) => edge.id === selectedEdge.value?.edge.id)
    ) {
      selectedEdge.value = undefined;
    }
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
    <div v-if="canEdit" class="lineage-graph__toolbar">
      <Space wrap align="center">
        <span class="lineage-graph__hint" data-testid="lineage-connect-hint">{{ t('lineage.connectHelp') }}</span>
        <template v-if="selectedEdge">
          <span class="lineage-graph__hint" data-testid="lineage-selected-edge">{{ selectedEdgeLabel }}</span>
          <Button
            danger
            data-testid="lineage-delete-selected-edge"
            @click="onDeleteSelectedEdge"
          >
            {{ t('lineage.deleteSelectedEdge') }}
          </Button>
        </template>
      </Space>
    </div>
    <VueFlow
      ref="flowRef"
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :nodes-draggable="true"
      :nodes-connectable="canEdit"
      :min-zoom="0.1"
      :max-zoom="2.5"
      @node-click="onNodeClick"
      @node-context-menu="onNodeContextMenu"
      @edge-click="onEdgeClick"
      @connect="onConnect"
      @move-end="onMoveEnd"
    >
      <Background :color="SM_SURFACES.borderSecondary" :gap="18" :size="1" />
      <Panel position="bottom-right">
        <LineageZoomControls
          :mini-map-visible="miniMapVisible"
          :zoom="zoom"
          @toggle-mini-map="miniMapVisible = !miniMapVisible"
          @zoom-in="onZoomIn"
          @zoom-out="onZoomOut"
          @fit-view="onFitView"
        />
      </Panel>
      <MiniMap v-if="miniMapVisible" pannable zoomable position="bottom-right" />
      <div class="lineage-graph__layers">
        <LineageLayers
          :entity-type="entityType"
          :entity-context="entityContext"
          :active-layer="activeLayer"
          :platform-view="platformView"
          @change-active-layer="(layers) => emit('change-active-layer', layers)"
          @change-platform-view="(view) => emit('change-platform-view', view)"
        />
      </div>
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
/* Pin's Layers panel sits bottom-left on the canvas; the zoom cluster
 * sits bottom-right, with the minimap above it. */
.lineage-graph__layers {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 5;
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
.lineage-graph :deep(.vue-flow__minimap) {
  overflow: hidden;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
}
/* The minimap panel sits above the bottom-right zoom cluster: 15px
   panel margin + ~52px cluster height + 8px gap, minus the 15px
   margin the panel itself carries. */
.lineage-graph :deep(.vue-flow__panel.bottom.right:has(.vue-flow__minimap)) {
  bottom: 60px;
}
</style>
