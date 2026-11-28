<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestSummaryGraph (Vue + echarts).
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import VChart from 'vue-echarts';
import { registerCharts } from '@/features/charts/register';
import { getTask } from '@/api/tasks';
import type { CollaborationTask } from '@/types/collaboration';
import type { TestCaseParameterValue, TestCaseResult } from '@/types/quality';
import TestSummaryCustomTooltip from '@/components/quality/TestSummaryCustomTooltip.vue';
import TestSummaryRunList from '@/components/quality/TestSummaryRunList.vue';
import TestSummaryStatusKey from '@/components/quality/TestSummaryStatusKey.vue';
import {
  STATUS_CHART_COLORS,
  applyStatusPlacements,
  formatTestSummaryYAxis,
  getParameterBounds,
  getStatusChartStatus,
  getThresholdReference,
  prepareChartData,
  placedSeriesKey,
  type TestSummaryChartPoint,
  type TestSummaryIncidentTask,
} from '@/quality/testSummaryGraphUtils';
import { formatContractDateTimeLong } from '@/utils/dataContract';

registerCharts();

const TABLE_FRESHNESS = 'tableDataToBeFresh';

const props = defineProps<{
  testCaseParameterValue?: TestCaseParameterValue[];
  testCaseResults: TestCaseResult[];
  testDefinitionName?: string;
  selectedTimestamp?: number;
  selectedTimeRange?: string;
}>();

const emit = defineEmits<{
  'select-run': [timestamp: number];
}>();

const { t } = useI18n();

const tasks = ref<TestSummaryIncidentTask[]>([]);
const activeTooltip = ref<{ point: TestSummaryChartPoint; x: number; y: number } | undefined>();
let tooltipCloseTimer: ReturnType<typeof setTimeout> | undefined;

const useFreshnessFormat = computed(() => props.testDefinitionName === TABLE_FRESHNESS);

watch(
  () => props.testCaseResults,
  async (results) => {
    const incidentIds = [...new Set(results.map((result) => result.incidentId).filter(Boolean) as string[])];
    const fetched: TestSummaryIncidentTask[] = [];
    await Promise.all(
      incidentIds.map(async (incidentId) => {
        try {
          const task = (await getTask(incidentId)) as CollaborationTask;
          fetched.push({ id: task.id, displayName: task.displayName || task.name, taskId: { id: task.name } });
        } catch {
          // One missing task must not hide chart metadata for other points.
        }
      }),
    );
    tasks.value = fetched;
  },
  { immediate: true },
);

const chartModel = computed(() => {
  const parameterValues = props.testCaseParameterValue ?? [];
  const { information, data } = prepareChartData({
    testCaseParameterValue: parameterValues,
    testCaseResults: props.testCaseResults,
    tasks: tasks.value,
  });
  const seriesLabels = information.map((item) => item.label);
  const threshold = getThresholdReference(parameterValues, props.testCaseResults[0]);
  const plotted = applyStatusPlacements(data, seriesLabels, threshold?.y);
  const bounds = getParameterBounds(parameterValues);
  return { information, plotted, seriesLabels, threshold, bounds };
});

const plottedStatuses = computed(() =>
  chartModel.value.plotted
    .map((point) => point.status)
    .filter((status): status is string => Boolean(status)),
);

function statusColor(status?: string): string {
  return STATUS_CHART_COLORS[getStatusChartStatus(status)];
}

const option = computed(() => {
  const { information, plotted, seriesLabels, threshold, bounds } = chartModel.value;
  if (plotted.length === 0) {
    return {};
  }

  const lineSeries = seriesLabels.map((label, index) => {
    const color = information[index]?.color ?? '#1570ef';
    const points = plotted.map((point: TestSummaryChartPoint) => {
      const measured = point[label];
      const placed = point[placedSeriesKey(label)];
      const value = typeof measured === 'number' ? measured : typeof placed === 'number' ? placed : null;
      return {
        value: [point.name, value],
        status: point.status,
        rawPoint: point,
        itemStyle: {
          color: statusColor(point.status),
          borderColor: point.status === 'Aborted' ? statusColor(point.status) : color,
          borderWidth: point.status === 'Aborted' ? 2 : 0,
        },
        symbol: point.status === 'Aborted' ? 'emptyCircle' : 'circle',
        symbolSize: point.name === props.selectedTimestamp ? 10 : 7,
      };
    });

    const markLine =
      index === 0 && threshold
        ? {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: '#98a2b3' },
            label: {
              formatter: t(threshold.labelKey, { value: threshold.labelValue }),
              position: 'insideStartTop' as const,
            },
            data: [{ yAxis: threshold.y }],
          }
        : undefined;

    const markArea =
      index === 0 && bounds.min !== undefined && bounds.max !== undefined
        ? {
            silent: true,
            itemStyle: { color: 'rgba(152, 162, 179, 0.12)' },
            data: [[{ yAxis: bounds.min }, { yAxis: bounds.max }]],
          }
        : undefined;

    return {
      name: label,
      type: 'line',
      showSymbol: true,
      connectNulls: true,
      smooth: false,
      lineStyle: { color, width: seriesLabels.length === 1 ? 2 : 1.5 },
      areaStyle: seriesLabels.length === 1 ? { color: 'rgba(21, 112, 239, 0.08)' } : undefined,
      data: points,
      markLine,
      markArea,
      emphasis: { disabled: true },
    };
  });

  const instants = [...new Set(plotted.map((p) => p.name))].sort((a, b) => a - b);
  const xMin = instants.length === 1 ? instants[0] - 12 * 60 * 60 * 1000 : undefined;
  const xMax = instants.length === 1 ? instants[0] + 12 * 60 * 60 * 1000 : undefined;

  return {
    grid: { left: 48, right: 16, top: 24, bottom: 56 },
    tooltip: { show: false },
    legend: { show: seriesLabels.length > 1, bottom: 0 },
    xAxis: {
      type: 'time',
      min: xMin,
      max: xMax,
      axisLabel: {
        hideOverlap: true,
        formatter: (value: number) =>
          new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => formatTestSummaryYAxis(value, useFreshnessFormat.value),
      },
    },
    series: lineSeries,
  };
});

function pointLabel(point: TestSummaryChartPoint): string {
  return `${formatContractDateTimeLong(Number(point.name))}: ${String(point.status ?? '')}`;
}

function cancelTooltipClose(): void {
  if (tooltipCloseTimer) {
    clearTimeout(tooltipCloseTimer);
    tooltipCloseTimer = undefined;
  }
}

function openTooltip(point: TestSummaryChartPoint, x: number, y: number): void {
  cancelTooltipClose();
  activeTooltip.value = { point, x, y };
}

function closeTooltipSoon(): void {
  cancelTooltipClose();
  tooltipCloseTimer = setTimeout(() => {
    activeTooltip.value = undefined;
    tooltipCloseTimer = undefined;
  }, 200);
}

function onChartClick(params: {
  data?: { value?: [number, number]; rawPoint?: TestSummaryChartPoint };
  event?: { offsetX?: number; offsetY?: number };
}): void {
  const ts = params.data?.value?.[0];
  if (typeof ts === 'number') {
    emit('select-run', ts);
  }
  const point = params.data?.rawPoint;
  if (point && params.event?.offsetX !== undefined && params.event?.offsetY !== undefined) {
    openTooltip(point, params.event.offsetX, params.event.offsetY);
  }
}

function onChartMouseOver(params: {
  data?: { rawPoint?: TestSummaryChartPoint };
  event?: { offsetX?: number; offsetY?: number };
}): void {
  const point = params.data?.rawPoint;
  if (point && params.event?.offsetX !== undefined && params.event?.offsetY !== undefined) {
    openTooltip(point, params.event.offsetX, params.event.offsetY);
  }
}

onBeforeUnmount(() => cancelTooltipClose());
</script>

<template>
  <div class="test-summary-graph" data-testid="test-summary-graph">
    <div v-if="testCaseResults.length === 0" class="test-summary-graph__empty" data-testid="test-summary-no-results">
      <p class="test-summary-graph__empty-title">
        {{ t('message.no-test-result-for-days', { days: selectedTimeRange }) }}
      </p>
      <p class="test-summary-graph__empty-desc">{{ t('message.try-extending-time-frame') }}</p>
    </div>
    <template v-else>
      <div class="test-summary-graph__plot">
        <VChart
          v-if="chartModel.plotted.length > 0"
          :option="option"
          autoresize
          style="height: 400px; width: 100%"
          @click="onChartClick"
          @mouseover="onChartMouseOver"
          @mouseout="closeTooltipSoon"
        />
        <div
          v-if="activeTooltip"
          class="test-summary-graph__tooltip"
          :style="{ transform: `translate(${activeTooltip.x + 12}px, ${activeTooltip.y + 12}px)` }"
          @mouseenter="cancelTooltipClose"
          @mouseleave="closeTooltipSoon"
        >
          <TestSummaryCustomTooltip :point="activeTooltip.point" />
        </div>
        <TestSummaryRunList
          :points="chartModel.plotted"
          :series-labels="chartModel.seriesLabels"
          :get-label="pointLabel"
        />
      </div>
      <div class="test-summary-graph__footer">
        <TestSummaryStatusKey :statuses="plottedStatuses" />
        <span class="test-summary-graph__hint">{{ t('message.select-a-point-for-run-details') }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.test-summary-graph__plot {
  position: relative;
}
.test-summary-graph__tooltip {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 4;
}
.test-summary-graph__footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding-bottom: 8px;
}
.test-summary-graph__hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.test-summary-graph__empty {
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: 1px dashed var(--sm-border-color);
  border-radius: 12px;
  padding: 24px;
}
.test-summary-graph__empty-title {
  margin: 0 0 8px;
  font-weight: 600;
}
.test-summary-graph__empty-desc {
  margin: 0;
  color: var(--sm-text-secondary);
}
</style>