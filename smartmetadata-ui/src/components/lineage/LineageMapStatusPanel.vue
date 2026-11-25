<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { InfoCircleOutlined } from '@ant-design/icons-vue';

/**
 * Pin `LineageMapStatusPanel` (a3012259ca,
 * `components/Lineage/LineageMap/LineageMap.component.tsx:968-1000`):
 * the top-right pill over the platform map. It renders nothing unless
 * the scene is truncated or sampled — then the notice reads
 * "Showing X of Y assets" (`label.showing-count-of-total-assets`,
 * count = visible nodes, total = visible + hidden). Pin also shows an
 * error alert here; the product renders the error placeholder instead
 * when the scene fails to load, so this panel only carries the
 * truncated notice.
 */
const props = defineProps<{
  nodeCount: number;
  hiddenNodeCount: number;
  sampled: boolean;
}>();

const { t } = useI18n();

const visible = computed(() => props.hiddenNodeCount > 0 || props.sampled);
const total = computed(() => props.nodeCount + props.hiddenNodeCount);
</script>

<template>
  <div v-if="visible" class="lineage-map-status" data-testid="lineage-map-status-panel">
    <span class="lineage-map-status__notice" data-testid="lineage-map-truncated-notice">
      <InfoCircleOutlined class="lineage-map-status__icon" />
      {{ t('lineage.mapShowingCountOfTotal', { count: nodeCount, total }) }}
    </span>
  </div>
</template>

<style scoped>
.lineage-map-status {
  position: absolute;
  right: 12px;
  top: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.lineage-map-status__notice {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 999px;
  background: var(--sm-bg-container);
  box-shadow: var(--sm-shadow-card);
  color: var(--sm-text-secondary);
  font-size: 13px;
}
.lineage-map-status__icon {
  color: var(--sm-color-primary);
  font-size: 14px;
}
</style>
