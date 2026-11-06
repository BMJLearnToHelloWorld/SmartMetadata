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
import { useVueFlow } from '@vue-flow/core';
import { Button } from 'ant-design-vue';
import {
  BranchesOutlined,
  ExpandOutlined,
  MinusOutlined,
  PlusOutlined,
  RedoOutlined,
  UndoOutlined,
} from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official CustomControls (pin a3012259ca), ported to Vue Flow + antd:
 * undo/redo, zoom out/in with the current zoom percentage, fit view, and
 * rearrange. Undo/redo are disabled in view mode; rearrange needs
 * structural edits (never live in the OSS build).
 *
 * R-9: official polls getZoom() on a 100ms interval for the percentage.
 * Vue Flow's viewport is reactive, so the percentage reads from it
 * directly — no timer.
 */

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const { viewport, fitView, zoomIn, zoomOut } = useVueFlow();

const currentZoom = computed(() => Math.round(viewport.value.zoom * 100));
const isViewMode = computed(() => builder.mode.isViewMode.value);
const allowStructuralGraphEdits = computed(
  () => builder.mode.allowStructuralGraphEdits.value,
);
const canUndo = computed(() => builder.history.canUndo.value);
const canRedo = computed(() => builder.history.canRedo.value);
const rearrangeDisabled = computed(
  () => isViewMode.value || !allowStructuralGraphEdits.value,
);

function handleFitView(): void {
  void fitView({ padding: 0.2 });
}
</script>

<template>
  <div class="workflow-custom-controls" data-testid="workflow-controls">
    <Button
      type="text"
      data-testid="undo-button"
      :disabled="!canUndo || isViewMode"
      :aria-label="t('workflows.builder.undo')"
      @click="builder.handleUndo"
    >
      <template #icon><UndoOutlined /></template>
    </Button>
    <Button
      type="text"
      data-testid="redo-button"
      :disabled="!canRedo || isViewMode"
      :aria-label="t('workflows.builder.redo')"
      @click="builder.handleRedo"
    >
      <template #icon><RedoOutlined /></template>
    </Button>

    <span class="workflow-custom-controls__divider" />

    <Button
      type="text"
      data-testid="zoom-out-button"
      :aria-label="t('workflows.builder.zoomOut')"
      :title="t('workflows.builder.zoomOut')"
      @click="zoomOut()"
    >
      <template #icon><MinusOutlined /></template>
    </Button>
    <span class="workflow-custom-controls__zoom">{{ currentZoom }}%</span>
    <Button
      type="text"
      data-testid="zoom-in-button"
      :aria-label="t('workflows.builder.zoomIn')"
      :title="t('workflows.builder.zoomIn')"
      @click="zoomIn()"
    >
      <template #icon><PlusOutlined /></template>
    </Button>

    <span class="workflow-custom-controls__divider" />

    <Button
      type="text"
      data-testid="fit-view-button"
      :aria-label="t('workflows.builder.fitToScreen')"
      :title="t('workflows.builder.fitToScreen')"
      @click="handleFitView"
    >
      <template #icon><ExpandOutlined /></template>
    </Button>

    <span class="workflow-custom-controls__divider" />

    <Button
      type="text"
      data-testid="rearrange-button"
      :disabled="rearrangeDisabled"
      :aria-label="t('workflows.builder.rearrangeNodes')"
      :title="t('workflows.builder.rearrangeNodes')"
      @click="rearrangeDisabled ? undefined : builder.handleRearrange()"
    >
      <template #icon><BranchesOutlined /></template>
    </Button>
  </div>
</template>

<style scoped>
.workflow-custom-controls {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card, 6px);
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.08);
}

.workflow-custom-controls__divider {
  width: 1px;
  height: 20px;
  background: var(--sm-border-secondary);
}

.workflow-custom-controls__zoom {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-text-secondary);
}
</style>
