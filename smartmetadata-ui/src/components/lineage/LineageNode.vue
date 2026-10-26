<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Tag } from 'ant-design-vue';
import { Handle, Position } from '@vue-flow/core';
import { entityTypeColor } from '@/catalog/searchHits';
import type { LineageColumnPort, LineageGraphNode } from '@/lineage/graphModel';

export interface LineageNodeData extends LineageGraphNode {
  expanded?: boolean;
  highlighted?: boolean;
  highlightedColumns?: string[];
  onToggleColumns?: () => void;
}

const props = defineProps<{
  data: LineageNodeData;
}>();

const { t, te } = useI18n();

const typeLabel = computed(() => {
  const key = `explore.entity.${props.data.entityType}`;
  return props.data.entityType && te(key) ? t(key) : props.data.entityType || t('lineage.entityFallback');
});

const visibleColumns = computed<LineageColumnPort[]>(() =>
  props.data.expanded ? props.data.columns : [],
);

function onToggle(event: Event): void {
  event.stopPropagation();
  event.preventDefault();
  props.data.onToggleColumns?.();
}

function columnClass(fqn: string): string {
  return props.data.highlightedColumns?.includes(fqn) ? 'lineage-node__column--active' : '';
}
</script>

<template>
  <div
    class="lineage-node"
    :class="{
      'lineage-node--center': data.isCenter,
      'lineage-node--highlighted': data.highlighted,
    }"
    :data-entity-type="data.entityType"
    :data-expanded="data.expanded ? 'true' : 'false'"
    :title="data.fullyQualifiedName"
  >
    <Handle type="target" :position="Position.Left" />
    <div class="lineage-node__head">
      <Tag :color="entityTypeColor(data.entityType)" class="lineage-node__chip">{{ typeLabel }}</Tag>
      <button
        v-if="data.columns.length"
        type="button"
        class="lineage-node__ports"
        data-testid="lineage-node-toggle-columns"
        @click="onToggle"
      >
        {{ t('lineage.mappedColumns', { count: data.columns.length }) }}
      </button>
    </div>
    <div class="lineage-node__body">
    <div class="lineage-node__name">{{ data.displayName || data.name }}</div>
    <div v-if="data.pathLabel" class="lineage-node__path">{{ data.pathLabel }}</div>
    <div class="lineage-node__fqn">{{ data.truncatedFqn || data.fullyQualifiedName || '—' }}</div>
    <div v-if="visibleColumns.length" class="lineage-node__columns" data-testid="lineage-node-columns">
      <div
        v-for="column in visibleColumns"
        :key="column.fqn"
        class="lineage-node__column"
        :class="columnClass(column.fqn)"
        :data-testid="`lineage-column-${column.fqn}`"
      >
        <Handle :id="column.fqn" type="target" :position="Position.Left" />
        <span class="lineage-node__column-name">{{ column.name }}</span>
        <Handle :id="column.fqn" type="source" :position="Position.Right" />
      </div>
    </div>
    </div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<style scoped>
.lineage-node {
  width: 252px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--sm-border-color, #f0f0f0);
  border-radius: var(--sm-border-radius, 6px);
  background: var(--sm-bg-container, #fff);
  box-shadow: var(--sm-shadow-card);
}
.lineage-node--center {
  border: 2px solid var(--sm-color-primary, #1570ef);
  box-shadow: 0 0 0 1px var(--sm-color-primary, #1570ef) inset;
}
.lineage-node--highlighted {
  border-color: var(--sm-color-warning, #dc6803);
  box-shadow: 0 0 0 1px var(--sm-color-warning, #dc6803) inset;
}
.lineage-node__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  background: var(--sm-table-header-bg, #f7f8fa);
  border-bottom: 1px solid var(--sm-border-secondary, #f0f0f0);
}
.lineage-node--center .lineage-node__head {
  background: var(--sm-color-primary-bg, #eff8ff);
}
.lineage-node__body {
  padding: 8px 10px 10px;
}
.lineage-node__chip {
  margin-inline-end: 0;
  line-height: 18px;
  font-size: 11px;
}
.lineage-node__ports {
  border: 0;
  background: none;
  padding: 0;
  color: var(--sm-color-primary, #1570ef);
  cursor: pointer;
  font-size: 11px;
}
.lineage-node__name {
  font-weight: 600;
  color: var(--sm-text-primary, #181d27);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-node__path,
.lineage-node__fqn {
  font-size: 11px;
  color: var(--sm-text-tertiary, #535862);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-node__columns {
  margin-top: 8px;
  border-top: 1px solid var(--sm-border-secondary, #f0f0f0);
  padding-top: 6px;
}
.lineage-node__column {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 22px;
  padding: 0 4px;
  font-size: 12px;
  color: var(--sm-text-secondary, #414651);
}
.lineage-node__column--active {
  background: #fff7e6;
  border-radius: 4px;
}
.lineage-node__column-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
