<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, markRaw } from 'vue';
import { MarkerType, VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import type { Edge, Node } from '@vue-flow/core';
import type { LineageGraphNode, PositionedLineageGraph } from '@/lineage/graphModel';
import LineageNode from './LineageNode.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const props = defineProps<{
  model: PositionedLineageGraph;
}>();

const emit = defineEmits<{
  navigate: [node: LineageGraphNode];
}>();

const nodeTypes = {
  asset: markRaw(LineageNode),
};

const nodes = computed<Node<LineageGraphNode>[]>(() =>
  props.model.nodes.map((node) => ({
    id: node.id,
    type: 'asset',
    position: node.position,
    data: node,
    draggable: false,
  })),
);

const edges = computed<Edge[]>(() =>
  props.model.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label || undefined,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
  })),
);

function onNodeClick(payload: { node: Node<LineageGraphNode> }): void {
  if (payload.node.data) {
    emit('navigate', payload.node.data);
  }
}
</script>

<template>
  <div class="lineage-graph" data-testid="lineage-graph">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      fit-view-on-init
      :min-zoom="0.3"
      :max-zoom="2"
      @node-click="onNodeClick"
    >
      <Background />
      <Controls />
    </VueFlow>
  </div>
</template>

<style scoped>
.lineage-graph {
  height: 560px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
}
</style>
