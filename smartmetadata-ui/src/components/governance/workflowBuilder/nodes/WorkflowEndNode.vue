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
import { Handle, Position } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import { useI18n } from 'vue-i18n';
import type { WorkflowNodeData } from '@/types/governance';
import { getWorkflowCanvasNodeIcon } from '@/utils/workflowNodeIcon';

/**
 * Official EndNode (CustomNodes.tsx), ported to Vue Flow: a pill with the
 * end icon and label, and a target handle on the left. Styled with the
 * product tokens, not official's Tailwind classes.
 */

defineOptions({ inheritAttrs: false });

/**
 * Declares the Vue Flow node contract (NodeProps<WorkflowNodeData>) so the
 * component is assignable to Vue Flow's NodeTypes; this static renderer
 * reads nothing from the props (label comes from i18n).
 */
defineProps<NodeProps<WorkflowNodeData>>();

const { t } = useI18n();
const icon = getWorkflowCanvasNodeIcon('endEvent');
</script>

<template>
  <div class="workflow-event-node" data-testid="workflow-end-node">
    <Handle
      type="target"
      :position="Position.Left"
      class="workflow-node-handle"
      :style="{ left: '-12px', top: '50%', transform: 'translateY(-50%)' }"
    />
    <span class="workflow-event-node__icon">
      <component :is="icon.icon" :style="{ color: icon.color }" />
    </span>
    <span class="workflow-event-node__label">{{ t('workflows.builder.end') }}</span>
  </div>
</template>

<style scoped>
.workflow-event-node {
  position: relative;
  display: flex;
  align-items: center;
  overflow: visible;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.05);
  padding: 6px 22px 6px 6px;
}

.workflow-event-node__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 16px;
}

.workflow-event-node__label {
  margin: 0;
  padding-left: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-text-primary);
  white-space: nowrap;
}

.workflow-node-handle {
  width: 10px;
  height: 10px;
  border: 2px solid var(--sm-color-primary);
  background: var(--sm-bg-container);
}
</style>
