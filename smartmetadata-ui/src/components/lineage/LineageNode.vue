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
  /** Edges in each direction exist (pin ExpandCollapseHandles visibility). */
  hasUpstream?: boolean;
  hasDownstream?: boolean;
  /** Side of the center (pin isUpstreamNode / isDownstreamNode / isRootNode). */
  side?: 'upstream' | 'downstream' | 'center' | 'other';
  /** A load-on-expand fetch already ran in this direction (pin expandPerformed). */
  expandedUpstream?: boolean;
  expandedDownstream?: boolean;
  /** Per-node "columns with lineage only" filter (pin nodeFilterState). */
  columnsLineageOnly?: boolean;
  /** Column FQNs of this node that carry lineage (the filter's allow-list). */
  lineageColumnFqns?: string[];
  /** Pin showDqTracing: this node is in the DQ lineage walk. */
  dqTraced?: boolean;
  onExpandChildren?: (direction: 'upstream' | 'downstream') => void;
  onCollapseChildren?: (direction: 'upstream' | 'downstream') => void;
  onToggleColumnsLineageOnly?: () => void;
}

const props = defineProps<{
  data: LineageNodeData;
}>();

const { t, te } = useI18n();

const typeLabel = computed(() => {
  const key = `explore.entity.${props.data.entityType}`;
  return props.data.entityType && te(key) ? t(key) : props.data.entityType || t('lineage.entityFallback');
});

const visibleColumns = computed<LineageColumnPort[]>(() => {
  if (!props.data.expanded) {
    return [];
  }
  if (!props.data.columnsLineageOnly) {
    return props.data.columns;
  }
  const allowed = props.data.lineageColumnFqns;
  if (!allowed) {
    return props.data.columns;
  }
  const allow = new Set(allowed);
  return props.data.columns.filter((column) => allow.has(column.fqn));
});

const showExpandRow = computed(
  () => showExpandUpstream.value || showExpandDownstream.value || showCollapseUpstream.value || showCollapseDownstream.value,
);

/**
 * Expand/collapse visibility mirrors pin CustomNodeV1 `getHandleVisibility`:
 * downstream expand needs no count (any leaf may have children), upstream
 * expand needs a nonzero upstream count; collapse is offered on a node's
 * own side or the root — plus any node whose children were loaded here, so
 * a load-on-expand can always be undone.
 */
const showExpandUpstream = computed(
  () =>
    !props.data.hasUpstream &&
    !props.data.expandedUpstream &&
    (props.data.upstreamCount ?? 0) > 0,
);
const showExpandDownstream = computed(
  () => !props.data.hasDownstream && !props.data.expandedDownstream,
);
const showCollapseUpstream = computed(
  () =>
    Boolean(props.data.hasUpstream) &&
    (props.data.side === 'upstream' || props.data.side === 'center' || props.data.expandedUpstream),
);
const showCollapseDownstream = computed(
  () =>
    Boolean(props.data.hasDownstream) &&
    (props.data.side === 'downstream' || props.data.side === 'center' || props.data.expandedDownstream),
);

function onToggle(event: Event): void {
  event.stopPropagation();
  event.preventDefault();
  props.data.onToggleColumns?.();
}

function onToggleLineageOnly(event: Event): void {
  event.stopPropagation();
  event.preventDefault();
  props.data.onToggleColumnsLineageOnly?.();
}

function onExpand(direction: 'upstream' | 'downstream', event: Event): void {
  event.stopPropagation();
  event.preventDefault();
  props.data.onExpandChildren?.(direction);
}

function onCollapse(direction: 'upstream' | 'downstream', event: Event): void {
  event.stopPropagation();
  event.preventDefault();
  props.data.onCollapseChildren?.(direction);
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
      'lineage-node--dq': data.dqTraced,
    }"
    :data-testid="`lineage-node-${data.fullyQualifiedName}`"
    :data-entity-type="data.entityType"
    :data-expanded="data.expanded ? 'true' : 'false'"
    :data-dq-traced="data.dqTraced ? 'true' : 'false'"
    :title="data.fullyQualifiedName"
  >
    <Handle type="target" :position="Position.Left" />
    <div class="lineage-node__head">
      <Tag :color="entityTypeColor(data.entityType)" class="lineage-node__chip">{{ typeLabel }}</Tag>
      <span
        v-if="data.dqTraced"
        class="lineage-node__dq"
        data-testid="lineage-node-dq-badge"
        :title="t('lineage.dqTraced')"
      >
        DQ
      </span>
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
      <button
        type="button"
        class="lineage-node__filter"
        :class="{ 'lineage-node__filter--active': data.columnsLineageOnly }"
        data-testid="lineage-node-columns-lineage-only"
        :aria-pressed="data.columnsLineageOnly ? 'true' : 'false'"
        @click="onToggleLineageOnly"
      >
        {{ t('lineage.columnsLineageOnly') }}
      </button>
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
    <div v-if="showExpandRow" class="lineage-node__expand">
      <button
        v-if="showExpandUpstream || showCollapseUpstream"
        type="button"
        class="lineage-node__expand-btn"
        :data-testid="showCollapseUpstream ? 'lineage-node-collapse-upstream' : 'lineage-node-expand-upstream'"
        @click="(event) => showCollapseUpstream ? onCollapse('upstream', event) : onExpand('upstream', event)"
      >
        {{ showCollapseUpstream ? t('lineage.collapseUpstream') : t('lineage.expandUpstream') }}
      </button>
      <button
        v-if="showExpandDownstream || showCollapseDownstream"
        type="button"
        class="lineage-node__expand-btn"
        :data-testid="showCollapseDownstream ? 'lineage-node-collapse-downstream' : 'lineage-node-expand-downstream'"
        @click="(event) => showCollapseDownstream ? onCollapse('downstream', event) : onExpand('downstream', event)"
      >
        {{ showCollapseDownstream ? t('lineage.collapseDownstream') : t('lineage.expandDownstream') }}
      </button>
    </div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<style scoped>
.lineage-node {
  width: 252px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  box-shadow: var(--sm-shadow-card);
}
.lineage-node--center {
  border: 2px solid var(--sm-color-primary);
  box-shadow: 0 0 0 1px var(--sm-color-primary) inset;
}
.lineage-node--highlighted {
  border-color: var(--sm-color-warning);
  box-shadow: 0 0 0 1px var(--sm-color-warning) inset;
}
.lineage-node--dq {
  border-color: var(--sm-color-warning);
  box-shadow: 0 0 0 1px var(--sm-color-warning) inset;
}
.lineage-node__dq {
  padding: 0 4px;
  border-radius: var(--sm-border-radius);
  background: var(--sm-color-warning-bg);
  color: var(--sm-color-warning);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}
.lineage-node__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  background: var(--sm-table-header-bg);
  border-bottom: 1px solid var(--sm-border-secondary);
}
.lineage-node--center .lineage-node__head {
  background: var(--sm-color-primary-bg);
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
  color: var(--sm-color-primary);
  cursor: pointer;
  font-size: 11px;
}
.lineage-node__name {
  font-weight: 600;
  color: var(--sm-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-node__path,
.lineage-node__fqn {
  font-size: 11px;
  color: var(--sm-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-node__columns {
  margin-top: 8px;
  border-top: 1px solid var(--sm-border-secondary);
  padding-top: 6px;
}
.lineage-node__column {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 22px;
  padding: 0 4px;
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.lineage-node__column--active {
  background: var(--sm-color-warning-highlight-bg);
  border-radius: 4px;
}
.lineage-node__filter {
  display: block;
  border: 0;
  background: none;
  padding: 0 4px 4px;
  color: var(--sm-color-primary);
  cursor: pointer;
  font-size: 11px;
  text-align: left;
}
.lineage-node__filter--active {
  font-weight: 600;
  text-decoration: underline;
}
.lineage-node__expand {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  border-top: 1px solid var(--sm-border-secondary);
  background: var(--sm-table-header-bg);
}
.lineage-node__expand-btn {
  border: 0;
  background: none;
  padding: 0;
  color: var(--sm-color-primary);
  cursor: pointer;
  font-size: 11px;
}
.lineage-node__column-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
