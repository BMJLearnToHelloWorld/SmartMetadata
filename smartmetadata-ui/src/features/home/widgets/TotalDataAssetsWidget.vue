<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Select } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import SmChart from '@/features/charts/SmChart.vue';
import type { ChartSeries } from '@/features/charts/types';
import type { TotalRangeDays } from '../homeQueries';

/**
 * `KnowledgePanel.TotalAssets` — the existing Total card: total count
 * + donut + 7/30-day window, as-is. Per-type growth and fastest
 * growing type are stage-B residuals (REVIEW-W1-5-G11 §2-12 row 3).
 */
defineProps<{
  total: string;
  series: ChartSeries[];
  axisLabels: string[];
  range: TotalRangeDays;
  rangeOptions: Array<{ value: TotalRangeDays; label: string }>;
}>();

const emit = defineEmits<{
  'change-range': [value: TotalRangeDays];
}>();

const { t, locale } = useI18n();

function formatAxisLabel(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' });
}

function onRange(value: unknown): void {
  if (value === 7 || value === 30) {
    emit('change-range', value);
  }
}
</script>

<template>
  <HomeWidgetCard :title="t('home.totalAssets')" test-id="home-widget-total-data-assets">
    <template #extra>
      <Select
        data-testid="home-total-range"
        size="small"
        :value="range"
        :options="rangeOptions"
        :bordered="false"
        @change="onRange"
      />
    </template>
    <div class="home-total" data-testid="home-total-body">
      <div class="home-total__count" data-testid="home-total-count">{{ total }}</div>
      <SmChart
        kind="donut"
        test-id="home-total-chart"
        :series="series"
        :empty="t('home.chartEmpty')"
        :height="180"
      />
      <div v-if="axisLabels.length" class="home-total__axis" data-testid="home-total-axis">
        <span v-for="label in axisLabels" :key="label">{{ formatAxisLabel(label) }}</span>
      </div>
    </div>
  </HomeWidgetCard>
</template>

<style scoped>
.home-total {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.home-total__count {
  font-size: 32px;
  font-weight: 650;
  color: var(--sm-text-primary);
}
.home-total__axis {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
</style>
