<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestSummaryGraph — line chart with status-coloured points and bounds.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import VChart from 'vue-echarts';
import { registerCharts } from '@/features/charts/register';
import type { TestCaseParameterValue, TestCaseResult } from '@/types/quality';
import {
  applyStatusPlacements,
  formatTestSummaryYAxis,
  getThresholdReference,
  prepareChartData,
  placedSeriesKey,
  type TestSummaryChartPoint,
} from '@/quality/testSummaryGraphUtils';

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

const chartRef = ref<InstanceType<typeof VChart>>();

const useFreshnessFormat = computed(() => props.testDefinitionName === TABLE_FRESHNESS);

const chartModel = computed(() => {
  const parameterValues = props.testCaseParameterValue ?? [];
  const { information, data } = prepareChartData({
    testCaseParameterValue: parameterValues,
    testCaseResults: props.testCaseResults,
  });
  const seriesLabels = information.map((item) => item.label);
  const threshold = getThresholdReference(parameterValues, props.testCaseResults[0]);
  const plotted = applyStatusPlacements(data, seriesLabels, threshold?.y);

  return { information, plotted, seriesLabels, threshold };
});

const statusColor = (status?: string) => {
  switch (status) {
    case 'Success':
      return '#17b26a';
    case 'Failed':
      return '#f04438';
    case 'Queued':
      return '#2e90fa';
    default:
      return '#f79009';
  }
};

const option = computed(() => {
  const { information, plotted, seriesLabels, threshold } = chartModel.value;
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
      emphasis: { disabled: true },
    };
  });

  const instants = [...new Set(plotted.map((p) => p.name))].sort((a, b) => a - b);
  const xMin = instants.length === 1 ? instants[0] - 12 * 60 * 60 * 1000 : undefined;
  const xMax = instants.length === 1 ? instants[0] + 12 * 60 * 60 * 1000 : undefined;

  return {
    grid: { left: 48, right: 16, top: 24, bottom: 56 },
    tooltip: { trigger: 'axis', show: false },
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

function onChartClick(params: { data?: { value?: [number, number] } }): void {
  const ts = params.data?.value?.[0];
  if (typeof ts === 'number') {
    emit('select-run', ts);
  }
}
</script>

<template>
  <div class="test-summary-graph" data-testid="test-summary-graph">
    <p v-if="selectedTimeRange" class="test-summary-graph__range">{{ selectedTimeRange }}</p>
    <VChart
      v-if="chartModel.plotted.length > 0"
      ref="chartRef"
      :option="option"
      autoresize
      style="height: 280px; width: 100%"
      @click="onChartClick"
    />
    <p v-else class="test-summary-graph__empty">{{ t('charts.empty') }}</p>
  </div>
</template>

<style scoped>
.test-summary-graph__range {
  font-size: 12px;
  color: var(--sm-text-secondary);
  margin: 0 0 8px;
}
.test-summary-graph__empty {
  text-align: center;
  color: var(--sm-text-secondary);
  padding: 48px 0;
}
</style>