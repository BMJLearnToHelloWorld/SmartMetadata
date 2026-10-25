<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, markRaw, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Select, Space } from 'ant-design-vue';
import { MarkerType, VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import type { Edge, Node } from '@vue-flow/core';
import { columnLineageEdges } from '@/lineage/columnPorts';
import { filterCanvasNodes } from '@/lineage/nodeChrome';
import {
  layoutLineageGraph,
  type LineageGraphModel,
  type LineageGraphNode,
} from '@/lineage/graphModel';
import LineageNode, { type LineageNodeData } from './LineageNode.vue';
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
  }>(),
  {
    variant: 'page',
    highlightedColumnFqns: () => [],
    highlightedNodeIds: () => [],
    highlightedEdgeIds: () => [],
  },
);

const emit = defineEmits<{
  navigate: [node: LineageGraphNode];
  'select-node': [node: LineageGraphNode];
}>();

const { t } = useI18n();
const expandedIds = ref<string[]>([]);
const selectedNodeId = ref<string | undefined>();
const fullscreen = ref(false);
const layoutNonce = ref(0);

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
  positioned.value.nodes.map((node) => ({
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
    },
  })),
);

const visibleColumnEdges = computed(() =>
  columnLineageEdges(props.model).filter(
    (edge) => expandedSet.value.has(edge.source) || expandedSet.value.has(edge.target),
  ),
);

const edges = computed<Edge[]>(() => {
  const entityEdges = props.model.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label || undefined,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
    class: props.highlightedEdgeIds.includes(edge.id) ? 'lineage-edge--active' : undefined,
  }));
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

watch(
  () => props.model.centerId,
  () => {
    expandedIds.value = [];
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
      { 'lineage-graph--fullscreen': fullscreen },
    ]"
    data-testid="lineage-graph"
  >
    <div class="lineage-graph__toolbar">
      <Space wrap align="center">
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
        <Button data-testid="lineage-reset-layout" @click="resetLayout">
          {{ t('lineage.resetLayout') }}
        </Button>
        <Button data-testid="lineage-fullscreen" @click="toggleFullscreen">
          {{ fullscreen ? t('lineage.exitFullscreen') : t('lineage.fullscreen') }}
        </Button>
      </Space>
    </div>
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :nodes-draggable="true"
      :nodes-connectable="false"
      fit-view-on-init
      :min-zoom="0.3"
      :max-zoom="2"
      @node-click="onNodeClick"
    >
      <Background />
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
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
}
.lineage-graph--page {
  flex: 1 1 auto;
  min-height: calc(100vh - 220px);
}
.lineage-graph--tab {
  height: 420px;
  min-height: 420px;
}
.lineage-graph--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1100;
  height: 100vh;
  min-height: 100vh;
  border-radius: 0;
  background: #f8fafc;
}
.lineage-graph__toolbar {
  padding: 8px 10px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}
.lineage-graph__find {
  min-width: 220px;
}
.lineage-graph :deep(.vue-flow) {
  flex: 1 1 auto;
  min-height: 0;
}
.lineage-graph :deep(.lineage-edge--active) {
  stroke: #fa8c16;
}
.lineage-graph :deep(.lineage-edge--column) {
  stroke: #1677ff;
  stroke-dasharray: 4 3;
}
</style>
