<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TableProfilerChart: showHeader=false is the custom-metric
  drawer preview; showHeader=true is the Table Profile tab (banner,
  overallSummary cards, data-volume area, volume-change bar when system
  profile has data, and CustomMetricGraphs). Vue3 + ant-design-vue +
  existing SmChart. No CCL React/CSS copy, no invented chart design.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { Typography } from 'ant-design-vue';
import type { OperationPermissions } from '@/api/permissions';
import type { CustomMetricRecord } from '@/api/customMetrics';
import { listSystemProfiles, listTableProfiles } from '@/api/profiler';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SmChart from '@/features/charts/SmChart.vue';
import type { TableProfile } from '@/types/quality';
import { buildOverallSummary } from '@/quality/columnProfile';
import {
  SYSTEM_OPERATION_KEYS,
  calculateCustomMetrics,
  calculateRowCountMetrics,
  calculateSystemMetrics,
  defaultProfilerRange,
  pointsForKey,
} from '@/quality/tableProfilerChart';
import CustomMetricGraphs from './CustomMetricGraphs.vue';
import NoProfilerBanner from './NoProfilerBanner.vue';

const props = withDefaults(
  defineProps<{
    entityFqn?: string;
    tableId?: string;
    customMetrics?: CustomMetricRecord[];
    showHeader?: boolean;
    tableProfile?: TableProfile | null;
    permissionsLoaded?: boolean;
    viewDataProfile?: boolean;
    permissions?: OperationPermissions;
  }>(),
  {
    entityFqn: undefined,
    tableId: undefined,
    customMetrics: () => [],
    showHeader: false,
    tableProfile: null,
    permissionsLoaded: false,
    viewDataProfile: false,
    permissions: undefined,
  },
);

const emit = defineEmits<{
  (event: 'edit-metric', metric: CustomMetricRecord): void;
  (event: 'metric-deleted'): void;
}>();

const { t } = useI18n();
const route = useRoute();
const rowPoints = ref(calculateRowCountMetrics([]));
const operationPoints = ref(calculateSystemMetrics([]));
const showSystemMetrics = ref(false);
const customMetricData = ref<Record<string, ReturnType<typeof calculateCustomMetrics>[string]>>({});

const isProfilingEnabled = computed(() => props.tableProfile != null);
const overallSummary = computed(() =>
  buildOverallSummary(props.tableProfile ?? null, (key, values) => t(key, values), 0),
);

const denied = computed(() => props.permissionsLoaded && !props.viewDataProfile);

function rangeFromRoute(): { startTs: number; endTs: number } {
  const fallback = defaultProfilerRange();
  const startTs = route.query.startTs ? Number(route.query.startTs) : fallback.startTs;
  const endTs = route.query.endTs ? Number(route.query.endTs) : fallback.endTs;
  return { startTs, endTs };
}

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

const emptyText = computed(() =>
  props.showHeader && !isProfilingEnabled.value
    ? t('message.no-profiler-card-message-with-link')
    : t('charts.empty'),
);

async function load(): Promise<void> {
  if (!props.entityFqn) {
    rowPoints.value = [];
    operationPoints.value = [];
    showSystemMetrics.value = false;
    customMetricData.value = {};
    return;
  }
  const range = rangeFromRoute();
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
  () =>
    [
      props.entityFqn,
      props.customMetrics.map((metric) => metric.name).join('|'),
      route.query.startTs,
      route.query.endTs,
    ] as const,
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="denied" class="table-profiler-chart-preview__denied">
    <PermissionPlaceholder
      :permission-value="t('label.view-entity', { entity: t('label.data-observability') })"
      test-id="permission-error-placeholder"
    />
  </div>
  <div v-else class="table-profiler-chart-preview" data-testid="table-profiler-chart-container">
    <template v-if="showHeader">
      <NoProfilerBanner v-if="!isProfilingEnabled" />
      <div class="table-profiler-chart-preview__summary">
        <div
          v-for="summary in overallSummary"
          :key="summary.key"
          class="table-profiler-chart-preview__card"
          :data-testid="`overall-summary-${summary.key}`"
        >
          <Typography.Text type="secondary">{{ summary.title }}</Typography.Text>
          <div class="table-profiler-chart-preview__card-value">{{ summary.value }}</div>
          <Typography.Text v-if="summary.extra" type="secondary">{{ summary.extra }}</Typography.Text>
        </div>
      </div>
    </template>
    <div class="table-profiler-chart-preview__metrics" data-testid="table-profiler-chart-metrics">
      <div data-testid="row-metrics">
        <Typography.Text strong>{{ t('label.data-volume') }}</Typography.Text>
        <SmChart kind="area" test-id="table-profiler-row-count-chart" :series="rowSeries" :empty="emptyText" :height="240" />
      </div>
      <div v-if="showSystemMetrics" data-testid="operation-metrics">
        <Typography.Text strong>{{ t('label.volume-change') }}</Typography.Text>
        <SmChart kind="bar" test-id="table-profiler-operation-chart" :series="operationSeries" :empty="emptyText" :height="240" />
      </div>
      <CustomMetricGraphs
        :series="customSeries"
        :custom-metrics="customMetrics"
        :empty-text="emptyText"
        :permissions="showHeader ? permissions : undefined"
        :table-id="showHeader ? tableId : undefined"
        @edit="emit('edit-metric', $event)"
        @deleted="emit('metric-deleted')"
      />
    </div>
  </div>
</template>

<style scoped>
.table-profiler-chart-preview {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.table-profiler-chart-preview__metrics {
  display: flex;
  flex-direction: column;
  gap: 30px;
}
.table-profiler-chart-preview__summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}
.table-profiler-chart-preview__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--sm-bg-elevated);
  border-radius: 6px;
  padding: 16px;
}
.table-profiler-chart-preview__card-value {
  color: var(--sm-text-primary);
  font-weight: 600;
  font-size: 1.125rem;
}
.table-profiler-chart-preview__denied {
  min-height: 15rem;
}
</style>
