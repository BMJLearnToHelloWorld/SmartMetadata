<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Tag } from 'ant-design-vue';
import { Handle, Position } from '@vue-flow/core';
import type { PipelineTaskGraphNode } from '@/pipeline/taskGraph';

export interface PipelineTaskNodeData extends PipelineTaskGraphNode {
  testId?: string;
}

const props = defineProps<{
  data: PipelineTaskNodeData;
}>();

const statusColor = computed(() => {
  switch (props.data.executionStatus) {
    case 'Successful':
      return 'green';
    case 'Failed':
      return 'red';
    case 'Pending':
      return 'gold';
    case 'Skipped':
      return 'default';
    default:
      return undefined;
  }
});
</script>

<template>
  <div class="pipeline-task-node" :data-testid="data.testId || `pipeline-task-${data.id}`">
    <Handle type="target" :position="Position.Top" />
    <div class="pipeline-task-node__name">{{ data.displayName }}</div>
    <div v-if="data.taskType" class="pipeline-task-node__type">{{ data.taskType }}</div>
    <Tag v-if="data.executionStatus" :color="statusColor" class="pipeline-task-node__status">
      {{ data.executionStatus }}
    </Tag>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.pipeline-task-node {
  width: 220px;
  min-height: 72px;
  padding: 8px 10px;
  border: 1px solid var(--ant-color-border, #d9d9d9);
  border-radius: 6px;
  background: var(--ant-color-bg-container, #fff);
  font-size: 12px;
}
.pipeline-task-node__name {
  font-weight: 600;
  line-height: 1.3;
}
.pipeline-task-node__type {
  color: var(--ant-color-text-secondary, #8c8c8c);
  margin-top: 2px;
}
.pipeline-task-node__status {
  margin-top: 6px;
}
</style>
