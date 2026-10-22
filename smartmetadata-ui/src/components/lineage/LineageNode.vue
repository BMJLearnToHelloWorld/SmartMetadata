<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import type { LineageGraphNode } from '@/lineage/graphModel';

defineProps<{
  data: LineageGraphNode;
}>();
</script>

<template>
  <div class="lineage-node" :class="{ 'lineage-node--center': data.isCenter }" :data-entity-type="data.entityType">
    <Handle type="target" :position="Position.Left" />
    <div class="lineage-node__type">{{ data.entityType || 'entity' }}</div>
    <div class="lineage-node__name">{{ data.displayName || data.name }}</div>
    <div class="lineage-node__fqn">{{ data.fullyQualifiedName || '—' }}</div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<style scoped>
.lineage-node {
  width: 232px;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}
.lineage-node--center {
  border-color: #1677ff;
  box-shadow: 0 0 0 1px #1677ff inset;
}
.lineage-node__type {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.lineage-node__name {
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-node__fqn {
  font-size: 12px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
