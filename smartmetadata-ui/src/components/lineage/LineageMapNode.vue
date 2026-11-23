<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Handle, Position } from '@vue-flow/core';
import type { LineageGraphNode } from '@/lineage/graphModel';
import { isContainerSceneNode, type LineageSceneNode } from '@/lineage/scene';
import LineageNode, { type LineageNodeData } from './LineageNode.vue';

/**
 * Scene node data: the shared graph node plus the scene node it came
 * from and the container chrome the official map draws (type subtitle
 * + asset-count pill + drill affordance).
 */
export interface LineageMapNodeData extends LineageGraphNode {
  sceneNode: LineageSceneNode;
  subtitle?: string;
  countLabel?: string;
  drillable: boolean;
  expanded?: boolean;
  highlighted?: boolean;
  highlightedColumns?: string[];
  onToggleColumns?: () => void;
  onDrill?: (node: LineageSceneNode) => void;
}

const props = defineProps<{
  data: LineageMapNodeData;
}>();

const { t } = useI18n();

const isContainer = computed(() => isContainerSceneNode(props.data.sceneNode));

const nodeData = computed<LineageNodeData>(() => props.data);

function onDrill(event: Event): void {
  event.stopPropagation();
  event.preventDefault();
  props.data.onDrill?.(props.data.sceneNode);
}
</script>

<template>
  <div
    class="lineage-map-node"
    :class="{
      'lineage-map-node--container': isContainer,
      'lineage-map-node--ghost': data.sceneNode.isGhost,
      'lineage-map-node--origin': data.sceneNode.isOrigin,
    }"
    :data-testid="`lineage-map-node-${data.id}`"
    :title="data.fullyQualifiedName"
  >
    <template v-if="isContainer">
      <Handle type="target" :position="Position.Left" />
      <div class="lineage-map-node__head">
        <span class="lineage-map-node__name">{{ data.displayName || data.name }}</span>
        <span v-if="data.countLabel" class="lineage-map-node__count" data-testid="lineage-map-node-count">
          {{ data.countLabel }}
        </span>
      </div>
      <div v-if="data.subtitle" class="lineage-map-node__subtitle">{{ data.subtitle }}</div>
      <div v-if="data.drillable" class="lineage-map-node__actions">
        <button
          type="button"
          class="lineage-map-node__drill"
          :data-testid="`lineage-map-drill-${data.id}`"
          :aria-label="t('lineage.mapDrillHelp')"
          @click="onDrill"
        >
          {{ t('lineage.mapDrill') }}
        </button>
      </div>
      <Handle type="source" :position="Position.Right" />
    </template>
    <LineageNode v-else :data="nodeData" />
  </div>
</template>

<style scoped>
.lineage-map-node--ghost {
  opacity: 0.45;
}
.lineage-map-node--container {
  width: 252px;
  overflow: hidden;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  box-shadow: var(--sm-shadow-card);
}
.lineage-map-node--origin {
  border-color: var(--sm-color-primary);
}
.lineage-map-node__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 4px;
}
.lineage-map-node__name {
  font-weight: 600;
  color: var(--sm-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-map-node__count {
  flex: none;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--sm-color-primary-bg);
  color: var(--sm-color-primary);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}
.lineage-map-node__subtitle {
  padding: 0 10px 8px;
  color: var(--sm-text-tertiary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-map-node__actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 10px 8px;
}
.lineage-map-node__drill {
  border: 0;
  background: none;
  padding: 0;
  color: var(--sm-color-primary);
  cursor: pointer;
  font-size: 11px;
}
</style>
