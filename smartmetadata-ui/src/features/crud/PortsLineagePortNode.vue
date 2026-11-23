<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Handle, Position } from '@vue-flow/core';
import { entityLabel } from '@/features/crud/paging';
import type { PortsLineagePortNodeData } from './portsLineage';

/**
 * Pin `PortNode.component.tsx` (a3012259ca): a lineage-style node with one
 * handle — a right `source` handle for input ports, a left `target`
 * handle for output ports (both id = the port handle id) — and the port
 * label. Test id mirrors pin: `port-node-${port.fullyQualifiedName}`.
 *
 * Props declare only `data` (the LineageNode.vue pattern): Vue Flow
 * passes the full NodeProps at runtime, but this node reads nothing
 * else, so the extra fields are not declared.
 */
const props = defineProps<{
  data: PortsLineagePortNodeData;
}>();

const { t, te } = useI18n();

const name = computed(() => entityLabel(props.data.port));

const typeLabel = computed(() => {
  const type = props.data.port.type || '';
  const key = `explore.entity.${type}`;
  return type && te(key) ? t(key) : type || t('lineage.entityFallback');
});
</script>

<template>
  <div class="ports-lineage-port-node" :data-testid="data.testId">
    <Handle
      v-if="data.isInputPort"
      type="source"
      :position="Position.Right"
      :id="data.handleId"
      class="ports-lineage-node-handle"
    />
    <Handle
      v-else
      type="target"
      :position="Position.Left"
      :id="data.handleId"
      class="ports-lineage-node-handle"
    />
    <div class="ports-lineage-port-node__content">
      <span class="ports-lineage-port-node__type">{{ typeLabel }}</span>
      <span class="ports-lineage-port-node__name" :title="data.port.fullyQualifiedName || name">
        {{ name }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.ports-lineage-port-node {
  width: 240px;
  min-height: 120px;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card);
  box-shadow: var(--sm-shadow-card);
}
.ports-lineage-port-node__content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ports-lineage-port-node__type {
  font-size: 12px;
  color: var(--sm-text-tertiary);
}
.ports-lineage-port-node__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-text-primary);
  overflow-wrap: anywhere;
}
</style>
