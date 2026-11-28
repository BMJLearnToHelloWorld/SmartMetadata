<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestSummaryRunList (a11y run list).
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { TestSummaryChartPoint } from '@/quality/testSummaryGraphUtils';
import { placedSeriesKey } from '@/quality/testSummaryGraphUtils';

const props = defineProps<{
  points: TestSummaryChartPoint[];
  seriesLabels: string[];
  getLabel: (point: TestSummaryChartPoint) => string;
}>();

const entries = computed(() =>
  props.points.flatMap((point, position) =>
    props.seriesLabels.reduce<{ id: string; label: string; point: TestSummaryChartPoint }[]>((items, label) => {
      const measured = point[label];
      const placed = point[placedSeriesKey(label)];
      if (typeof measured === 'number' || typeof placed === 'number') {
        items.push({
          id: `${String(point.name)}-${label}-${position}`,
          label,
          point,
        });
      }
      return items;
    }, []),
  ),
);
</script>

<template>
  <ul class="test-summary-run-list" data-testid="test-summary-runs">
    <li
      v-for="entry in entries"
      :key="entry.id"
      :data-status="entry.point.status"
      :data-testid="`test-summary-point-${entry.label}`"
    >
      {{ getLabel(entry.point) }}
    </li>
  </ul>
</template>

<style scoped>
.test-summary-run-list {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>