<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TableProfilerChart with showHeader=false (the custom-metric
  drawer preview). Vue3 + ant-design-vue + existing SmChart. No CCL
  React/CSS copy, no invented chart design.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Typography } from 'ant-design-vue';
import { listSystemProfiles, listTableProfiles } from '@/api/profiler';
import SmChart from '@/features/charts/SmChart.vue';
import {
  SYSTEM_OPERATION_KEYS,
  calculateCustomMetrics,
  calculateRowCountMetrics,
  calculateSystemMetrics,
  defaultProfilerRange,
  pointsForKey,
} from '@/quality/tableProfilerChart';

const props = withDefaults(
  defineProps<{
    entityFqn?: string;
    customMetrics?: Array<{ name: string }>;
  }>(),
  {
    entityFqn: undefined,
    customMetrics: () => [],
  },
);

const { t } = useI18n();
const rowPoints = ref(calculateRowCountMetrics([]));
const operationPoints = ref(calculateSystemMetrics([]));
const showSystemMetrics = ref(false);
const customMetricData = ref<Record<string, ReturnType<typeof calculateCustomMetrics>[string]>>({});

const rowSeries = computed(() => [
  {
    name: t('label.entity-count', { entity: t('label.row') }),
    points: pointsForKey(rowPoints.value, 'rowCount'),
  },
]);

const operationSeries = computed(() =>
  SYSTEM_OPERATION_KEYS.map((key) => ({
    name: t(`label.${key.toLowerCase()}`),
    points: pointsForKey(operationPoints.value, key),
  })).filter((series) => series.points.some((point) => Number.isFinite(point.value))),
);

const customSeries = computed(() =>
  Object.entries(customMetricData.value).map(([name, rows]) => ({
    name,
    points: pointsForKey(rows ?? [], name),
  })),
);

const emptyText = computed(() => t('charts.empty'));

async function load(): Promise<void> {
  if (!props.entityFqn) {
    rowPoints.value = [];
    operationPoints.value = [];
    showSystemMetrics.value = false;
    customMetricData.value = {};
    return;
  }
  const range = defaultProfilerRange();
  try {
    const [profiles, system] = await Promise.all([
      listTableProfiles(props.entityFqn, range.startTs, range.endTs),
      listSystemProfiles(props.entityFqn, range.startTs, range.endTs).catch(() => []),
    ]);
    rowPoints.value = calculateRowCountMetrics(profiles);
    operationPoints.value = calculateSystemMetrics(system);
    showSystemMetrics.value = system.length > 0;
    customMetricData.value = calculateCustomMetrics(profiles, props.customMetrics);
  } catch {
    rowPoints.value = [];
    operationPoints.value = [];
    showSystemMetrics.value = false;
    customMetricData.value = {};
  }
}

watch(
  () => [props.entityFqn, props.customMetrics.map((metric) => metric.name).join('|')] as const,
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <div class="table-profiler-chart-preview" data-testid="table-profiler-chart-container">
    <div class="table-profiler-chart-preview__metrics" data-testid="table-profiler-chart-metrics">
      <div data-testid="row-metrics">
        <Typography.Text strong>{{ t('label.data-volume') }}</Typography.Text>
        <SmChart kind="area" test-id="table-profiler-row-count-chart" :series="rowSeries" :empty="emptyText" :height="240" />
      </div>
      <div v-if="showSystemMetrics" data-testid="operation-metrics">
        <Typography.Text strong>{{ t('label.volume-change') }}</Typography.Text>
        <SmChart kind="bar" test-id="table-profiler-operation-chart" :series="operationSeries" :empty="emptyText" :height="240" />
      </div>
      <div
        v-for="series in customSeries"
        :key="series.name"
        class="table-profiler-chart-preview__custom"
        :data-testid="`custom-metric-graph-${series.name}`"
      >
        <Typography.Text strong>{{ series.name }}</Typography.Text>
        <SmChart kind="area" :test-id="`custom-metric-chart-${series.name}`" :series="[series]" :empty="emptyText" :height="240" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-profiler-chart-preview__metrics {
  display: flex;
  flex-direction: column;
  gap: 30px;
}
</style>
