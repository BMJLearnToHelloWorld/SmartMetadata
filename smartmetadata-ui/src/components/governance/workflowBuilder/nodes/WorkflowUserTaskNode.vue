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
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import type { WorkflowNodeData } from '@/types/governance';
import { getWorkflowCanvasNodeIcon } from '@/utils/workflowNodeIcon';
import { getDisplayLabelFromSubType } from '@/utils/workflowNodeUtils';
import { getWorkflowNodeTestId } from '@/utils/workflowNodeUtils';

/**
 * Official UserTaskNode (CustomNodes.tsx), ported to Vue Flow. Same card
 * as the automated task node; official differs only in header padding
 * (16px horizontal instead of 12px). Styled with the product tokens, not
 * official's Tailwind classes.
 */

defineOptions({ inheritAttrs: false });

/**
 * Props are the Vue Flow node contract (NodeProps<WorkflowNodeData>);
 * the component reads `data` and `selected` from it.
 */
const props = defineProps<NodeProps<WorkflowNodeData>>();

const icon = computed(() => getWorkflowCanvasNodeIcon(props.data.subType));
const displayLabel = computed(() =>
  getDisplayLabelFromSubType(props.data.subType),
);
const testId = computed(() => getWorkflowNodeTestId(props.data.subType));
</script>

<template>
  <div
    class="workflow-task-node"
    :class="{ 'workflow-task-node--selected': props.selected }"
    :data-testid="testId"
  >
    <Handle
      type="target"
      :position="Position.Left"
      class="workflow-node-handle"
      :style="{ left: '-12px', top: '50%', transform: 'translateY(-50%)' }"
    />
    <div class="workflow-task-node__header">
      <span class="workflow-task-node__icon">
        <component :is="icon.icon" :style="{ color: icon.color }" />
      </span>
      <span class="workflow-task-node__type">{{ displayLabel }}</span>
    </div>
    <div class="workflow-task-node__divider" />
    <div class="workflow-task-node__body">
      <span class="workflow-task-node__name">{{
        props.data.displayName || props.data.label
      }}</span>
    </div>
    <Handle
      type="source"
      :position="Position.Right"
      class="workflow-node-handle"
      :style="{ right: '-12px', top: '50%', transform: 'translateY(-50%)' }"
    />
  </div>
</template>

<style scoped>
.workflow-task-node {
  position: relative;
  min-width: 264px;
  overflow: visible;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card, 6px);
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.05);
  transition: outline 0.2s ease;
}

.workflow-task-node:hover,
.workflow-task-node--selected {
  outline: 2px solid var(--sm-color-primary);
}

.workflow-task-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: var(--sm-radius-card, 6px) var(--sm-radius-card, 6px) 0 0;
}

.workflow-task-node__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 16px;
}

.workflow-task-node__type {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-text-primary);
  white-space: nowrap;
}

.workflow-task-node__divider {
  height: 1px;
  background: var(--sm-border-secondary);
}

.workflow-task-node__body {
  padding: 14px 12px;
}

.workflow-task-node__name {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-text-primary);
}

.workflow-node-handle {
  width: 10px;
  height: 10px;
  border: 2px solid var(--sm-color-primary);
  background: var(--sm-bg-container);
}
</style>
