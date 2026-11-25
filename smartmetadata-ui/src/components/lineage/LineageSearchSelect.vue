<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Select } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import type { LineageGraphNode } from '@/lineage/graphModel';

/**
 * Pin `LineageSearchSelect` (a3012259ca,
 * `components/Lineage/LineageSearchSelect/LineageSearchSelect.tsx`):
 * the entity-canvas node search. Options are every canvas node plus
 * its columns (`generateNodeOptions`; a column option reads
 * "node name › column name", and a column whose FQN equals its node is
 * skipped so it cannot overwrite the node option). Selecting a node
 * opens the drawer and centers it; selecting a column selects that
 * column — the parent performs both actions, this component only
 * reports the choice. Pin returns null on the platform canvas, so
 * this component is only mounted in the entity canvas header.
 */
const props = defineProps<{
  nodes: LineageGraphNode[];
}>();

const emit = defineEmits<{
  'select-node': [node: LineageGraphNode];
  'select-column': [columnFqn: string];
}>();

const { t } = useI18n();

const value = ref<string | undefined>(undefined);

interface SearchOption {
  value: string;
  label: string;
}

const options = computed<SearchOption[]>(() => {
  const list: SearchOption[] = [];
  for (const node of props.nodes) {
    list.push({ value: node.id, label: node.displayName });
    for (const column of node.columns ?? []) {
      if (!column.fqn || column.fqn === node.fullyQualifiedName) {
        continue;
      }
      list.push({ value: column.fqn, label: `${node.displayName} › ${column.name}` });
    }
  }
  return list;
});

function filterOption(input: string, option?: { label?: string }): boolean {
  return String(option?.label ?? '')
    .toLowerCase()
    .includes(input.toLowerCase());
}

/**
 * antd Select emits SelectValue (RawValue | LabeledValue); this select
 * only ever carries plain string values, so normalise to string terms
 * here and keep the handler in string terms (same pattern as
 * MetricCreateDrawer.asSingleString).
 */
function asSingleString(value: SelectValue): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const labeled = value.value;
    return typeof labeled === 'string' ? labeled : undefined;
  }
  return undefined;
}

function onSelect(selected: SelectValue): void {
  const selectedValue = asSingleString(selected);
  value.value = undefined;
  if (!selectedValue) {
    return;
  }
  const node = props.nodes.find((candidate) => candidate.id === selectedValue);
  if (node) {
    emit('select-node', node);
  } else {
    emit('select-column', selectedValue);
  }
}
</script>

<template>
  <Select
    v-model:value="value"
    class="lineage-search-select"
    data-testid="lineage-search-select"
    show-search
    allow-clear
    :placeholder="t('lineage.impactSearch')"
    :options="options"
    :filter-option="filterOption"
    @select="onSelect"
  />
</template>

<style scoped>
.lineage-search-select {
  width: 320px;
  max-width: 40vw;
}
</style>
