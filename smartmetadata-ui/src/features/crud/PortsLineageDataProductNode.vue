<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Handle, Position } from '@vue-flow/core';
import { entityLabel } from '@/features/crud/paging';
import type { PortsLineageDataProductNodeData } from './portsLineage';

/**
 * Pin `DataProductNode.component.tsx` (a3012259ca): the center node of the
 * ports lineage graph — a left `target` handle (`${id}-left`) and a right
 * `source` handle (`${id}-right`), a "Data Product" badge, and the product
 * name. Test id mirrors pin: `data-product-center-node`.
 *
 * Props declare only `data` (the LineageNode.vue pattern): Vue Flow
 * passes the full NodeProps at runtime, but this node reads nothing
 * else, so the extra fields are not declared.
 */
const props = defineProps<{
  data: PortsLineageDataProductNodeData;
}>();

const { t } = useI18n();

const name = computed(() => entityLabel(props.data.dataProduct));
const productId = computed(() => props.data.dataProduct.id);
</script>

<template>
  <div class="ports-lineage-data-product-node" data-testid="data-product-center-node">
    <Handle
      type="target"
      :position="Position.Left"
      :id="`${productId}-left`"
      class="ports-lineage-node-handle"
    />
    <Handle
      type="source"
      :position="Position.Right"
      :id="`${productId}-right`"
      class="ports-lineage-node-handle"
    />
    <div class="ports-lineage-data-product-node__badge">{{ t('label.data-product') }}</div>
    <div
      class="ports-lineage-data-product-node__name"
      :title="data.dataProduct.fullyQualifiedName || name"
    >
      {{ name }}
    </div>
  </div>
</template>

<style scoped>
.ports-lineage-data-product-node {
  width: 240px;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--sm-color-primary-bg);
  border: 1px solid var(--sm-color-primary);
  border-radius: var(--sm-radius-card);
  box-shadow: var(--sm-shadow-card);
}
.ports-lineage-data-product-node__badge {
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-color-primary);
}
.ports-lineage-data-product-node__name {
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  color: var(--sm-text-primary);
  overflow-wrap: anywhere;
}
</style>
