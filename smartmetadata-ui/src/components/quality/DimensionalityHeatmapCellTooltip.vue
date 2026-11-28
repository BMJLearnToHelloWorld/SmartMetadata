<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official HeatmapCellTooltip.component.tsx.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { HeatmapCellData } from '@/quality/dimensionalityHeatmap.utils';
import { getStatusLabel } from '@/quality/dimensionalityHeatmap.utils';

const props = defineProps<{
  cell: HeatmapCellData;
}>();

const { t } = useI18n();

const rows = computed(() => {
  const { cell } = props;
  const items: { key: string; label: string; value: string | number }[] = [
    { key: 'dimensionValue', label: t('label.dimension-value'), value: cell.dimensionValue },
    { key: 'status', label: t('label.status'), value: getStatusLabel(cell.status, t) },
  ];
  if (cell.result?.passedRows !== undefined) {
    items.push({ key: 'passedRows', label: t('label.passed-rows'), value: cell.result.passedRows });
  }
  if (cell.result?.failedRows !== undefined) {
    items.push({ key: 'failedRows', label: t('label.failed-rows'), value: cell.result.failedRows });
  }
  if (cell.result?.impactScore !== undefined) {
    items.push({
      key: 'impactScore',
      label: t('label.impact-score'),
      value: cell.result.impactScore.toFixed(2),
    });
  }
  for (const entry of cell.result?.testResultValue ?? []) {
    items.push({
      key: entry.name,
      label: entry.name || t('label.value'),
      value: entry.value || '—',
    });
  }
  return items;
});
</script>

<template>
  <div class="heatmap-cell-tooltip">
    <p class="heatmap-cell-tooltip__date">{{ cell.date }}</p>
    <dl class="heatmap-cell-tooltip__rows">
      <div v-for="row in rows" :key="row.key">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.heatmap-cell-tooltip {
  min-width: 200px;
  max-width: 280px;
  padding: 8px 12px;
  background: var(--sm-bg-container, #fff);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
}
.heatmap-cell-tooltip__date {
  margin: 0 0 8px;
  font-weight: 600;
  font-size: 13px;
}
.heatmap-cell-tooltip__rows {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.heatmap-cell-tooltip__rows dt {
  font-size: 11px;
  color: var(--sm-text-secondary);
}
.heatmap-cell-tooltip__rows dd {
  margin: 2px 0 0;
  font-size: 12px;
  font-weight: 500;
}
</style>