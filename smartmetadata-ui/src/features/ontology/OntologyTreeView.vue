<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Typography } from 'ant-design-vue';
import {
  filterTreeIndexForSearch,
  orderTreeRows,
  type OntologyTreeIndex,
  type OntologyTreeRow,
} from './ontologyTree';

/**
 * Native tree view (official components/OntologyExplorer/
 * OntologyTreeView.tsx + NativeOntologyTreeView.tsx, Vue port).
 * Renders the native tree index built from the same graph model as the
 * canvas: connected concepts as a depth-ordered hierarchy (expand /
 * collapse, default expanded) plus isolated concepts in their own
 * "Not connected" section. Selection is shared with the graph surface
 * through selectedNodeId. Search filters rows to matches plus their
 * ancestor chains.
 */
const props = defineProps<{
  index: OntologyTreeIndex;
  selectedNodeId?: string | null;
  searchQuery?: string;
}>();

const emit = defineEmits<{
  (event: 'select-node', nodeId: string): void;
}>();

const { t } = useI18n();
/** Collapsed node ids; empty means fully expanded (official default). */
const collapsedIds = ref(new Set<string>());

const MAX_INDENT_LEVEL = 16;

const rows = computed(() => orderTreeRows(props.index));

const visibleIds = computed(() =>
  props.searchQuery ? filterTreeIndexForSearch(props.index, props.searchQuery) : null,
);

function isRowVisible(row: OntologyTreeRow, ancestorsExpanded: boolean): boolean {
  if (!ancestorsExpanded) {
    return false;
  }
  return visibleIds.value === null || visibleIds.value.has(row.node.id);
}

/** Flat visible rows: a row shows when its ancestors are expanded. */
const visibleRows = computed(() => {
  const result: OntologyTreeRow[] = [];
  const stack: Array<{ depth: number; expanded: boolean }> = [];
  for (const row of rows.value) {
    while (stack.length && stack[stack.length - 1]!.depth >= row.depth) {
      stack.pop();
    }
    const ancestorsExpanded = stack.every((entry) => entry.expanded);
    const searching = visibleIds.value !== null;
    const expanded = searching || !collapsedIds.value.has(row.node.id);
    if (isRowVisible(row, ancestorsExpanded)) {
      result.push(row);
    }
    stack.push({ depth: row.depth, expanded: ancestorsExpanded && expanded });
  }
  return result;
});

const connectedRows = computed(() => visibleRows.value.filter((row) => !row.isIsolated));
const unconnectedRows = computed(() => visibleRows.value.filter((row) => row.isIsolated));

function childCount(row: OntologyTreeRow): number {
  return props.index.children.get(row.node.id)?.length ?? 0;
}

function toggle(row: OntologyTreeRow): void {
  const next = new Set(collapsedIds.value);
  if (next.has(row.node.id)) {
    next.delete(row.node.id);
  } else {
    next.add(row.node.id);
  }
  collapsedIds.value = next;
}

function expandAll(): void {
  collapsedIds.value = new Set();
}

function collapseAll(): void {
  const next = new Set<string>();
  for (const row of rows.value) {
    if (childCount(row) > 0) {
      next.add(row.node.id);
    }
  }
  collapsedIds.value = next;
}
</script>

<template>
  <div data-testid="ontology-tree-view">
    <div v-if="rows.length === 0">
      <Typography.Text type="secondary">{{ t('ontology.browser.treeEmpty') }}</Typography.Text>
    </div>
    <div v-if="connectedRows.length > 0" data-testid="ontology-tree-concepts" style="margin-bottom: 16px">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px">
        <Typography.Text strong>
          {{ t('ontology.browser.treeConcepts') }} ({{ connectedRows.length }})
        </Typography.Text>
        <span>
          <Button size="small" type="link" data-testid="ontology-tree-expand-all" @click="expandAll">
            {{ t('ontology.browser.treeExpandAll') }}
          </Button>
          <Button size="small" type="link" data-testid="ontology-tree-collapse-all" @click="collapseAll">
            {{ t('ontology.browser.treeCollapseAll') }}
          </Button>
        </span>
      </div>
      <Card :body-style="{ padding: 0 }">
        <ul style="list-style: none; margin: 0; padding: 0">
          <li
            v-for="row in connectedRows"
            :key="row.node.id"
            :data-testid="`ontology-tree-term-${row.node.id}`"
            :aria-selected="selectedNodeId === row.node.id"
            :class="{ 'ontology-tree-row-selected': selectedNodeId === row.node.id }"
            :style="{ paddingLeft: `${Math.min(row.depth, MAX_INDENT_LEVEL) * 20 + 8}px` }"
            style="display: flex; align-items: center; gap: 8px; padding-top: 8px; padding-bottom: 8px; padding-right: 12px; border-top: 1px solid var(--sm-border-secondary); cursor: pointer"
            @click="emit('select-node', row.node.id)"
          >
            <Button
              v-if="childCount(row) > 0"
              size="small"
              type="text"
              :data-testid="`ontology-tree-toggle-${row.node.id}`"
              @click.stop="toggle(row)"
            >
              {{ collapsedIds.has(row.node.id) ? '▸' : '▾' }}
            </Button>
            <span style="flex: 1; min-width: 0">
              <Typography.Text strong>{{ row.node.label }}</Typography.Text>
              <Typography.Text v-if="row.node.fullyQualifiedName" type="secondary" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                {{ row.node.fullyQualifiedName }}
              </Typography.Text>
            </span>
            <Typography.Text v-if="childCount(row) > 0" type="secondary">
              {{ t('ontology.browser.treeChildren', { count: childCount(row) }) }}
            </Typography.Text>
            <Typography.Text v-if="row.parentCount > 1" type="warning">
              {{ t('ontology.browser.treePolyhierarchy') }}
            </Typography.Text>
            <Typography.Text type="secondary">
              {{ t('ontology.browser.treeRelations', { count: row.relationCount }) }}
            </Typography.Text>
          </li>
        </ul>
      </Card>
    </div>
    <div v-if="unconnectedRows.length > 0" data-testid="ontology-tree-unconnected">
      <Typography.Text strong>
        {{ t('ontology.browser.treeUnconnected') }} ({{ unconnectedRows.length }})
      </Typography.Text>
      <Typography.Text type="secondary" style="display: block; margin-bottom: 8px">
        {{ t('ontology.browser.treeUnconnectedHint') }}
      </Typography.Text>
      <Card :body-style="{ padding: 0 }">
        <ul style="list-style: none; margin: 0; padding: 0">
          <li
            v-for="row in unconnectedRows"
            :key="row.node.id"
            :data-testid="`ontology-tree-term-${row.node.id}`"
            :aria-selected="selectedNodeId === row.node.id"
            :class="{ 'ontology-tree-row-selected': selectedNodeId === row.node.id }"
            style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--sm-border-secondary); cursor: pointer"
            @click="emit('select-node', row.node.id)"
          >
            <span style="flex: 1; min-width: 0">
              <Typography.Text strong>{{ row.node.label }}</Typography.Text>
              <Typography.Text v-if="row.node.fullyQualifiedName" type="secondary" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                {{ row.node.fullyQualifiedName }}
              </Typography.Text>
            </span>
          </li>
        </ul>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.ontology-tree-row-selected {
  background: var(--sm-row-selected-bg);
}
</style>
