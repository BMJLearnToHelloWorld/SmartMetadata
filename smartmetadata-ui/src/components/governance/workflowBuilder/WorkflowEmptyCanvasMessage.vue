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
import { DragOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official EmptyCanvasMessage (pin a3012259ca), ported to Vue + antd:
 * renders only when the canvas is empty, nothing is being dragged, the
 * builder is in edit mode, and the node palette is shown. In the OSS build
 * the palette is never shown, so this never renders there — same gating,
 * present in the tree, not live behavior. Official uses a click SVG; the
 * product uses the closest antd drag glyph.
 */

const { t } = useI18n();
const builder = useWorkflowBuilderContext();

const visible = computed(
  () =>
    !builder.state.state.isDragging &&
    !builder.state.hasNodes.value &&
    !builder.mode.isViewMode.value &&
    builder.mode.showWorkflowNodePalette.value,
);
</script>

<template>
  <div v-if="visible" class="workflow-empty-canvas">
    <div class="workflow-empty-canvas__card">
      <DragOutlined class="workflow-empty-canvas__icon" />
      <p class="workflow-empty-canvas__text">
        {{ t('workflows.builder.dragAndDropNodesHere') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.workflow-empty-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.workflow-empty-canvas__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 24px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card, 6px);
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.05);
}

.workflow-empty-canvas__icon {
  font-size: 24px;
  color: var(--sm-text-secondary);
}

.workflow-empty-canvas__text {
  margin: 8px 0 0;
  font-size: 14px;
  text-align: center;
  color: var(--sm-text-primary);
}
</style>
