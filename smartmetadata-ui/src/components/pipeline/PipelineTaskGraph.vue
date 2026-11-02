<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, markRaw } from 'vue';
import { MarkerType, VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import type { Edge, Node } from '@vue-flow/core';
import { layoutPipelineTaskGraph, type PipelineTaskGraphModel } from '@/pipeline/taskGraph';
import PipelineTaskNode, { type PipelineTaskNodeData } from './PipelineTaskNode.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const props = defineProps<{
  model: PipelineTaskGraphModel;
}>();

const nodeTypes = {
  pipelineTask: markRaw(PipelineTaskNode),
};

const positioned = computed(() => layoutPipelineTaskGraph(props.model));

const nodes = computed<Node<PipelineTaskNodeData>[]>(() =>
  positioned.value.nodes.map((node) => ({
    id: node.id,
    type: 'pipelineTask',
    position: node.position,
    draggable: true,
    data: {
      ...node,
      testId: `pipeline-task-${node.id}`,
    },
  })),
);

const edges = computed<Edge[]>(() =>
  positioned.value.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    markerEnd: { type: MarkerType.ArrowClosed },
  })),
);
</script>

<template>
  <div class="pipeline-task-graph" data-testid="pipeline-task-graph">
    <VueFlow :nodes="nodes" :edges="edges" :node-types="nodeTypes" fit-view>
      <Background />
      <Controls />
      <div data-testid="pipeline-task-minimap">
        <MiniMap pannable zoomable />
      </div>
    </VueFlow>
  </div>
</template>

<style scoped>
.pipeline-task-graph {
  height: 360px;
  border: 1px solid var(--ant-color-border, #f0f0f0);
  border-radius: 6px;
}
</style>
