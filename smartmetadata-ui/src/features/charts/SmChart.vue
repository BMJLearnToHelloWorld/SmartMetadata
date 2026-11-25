<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Alert, Empty } from 'ant-design-vue';
import VChart from 'vue-echarts';
import { buildChartOption } from './option';
import { registerCharts } from './register';
import type { ChartKind, ChartSeries } from './types';
import { hasChartPoints } from './types';

registerCharts();

const props = withDefaults(
  defineProps<{
    kind: ChartKind;
    series: ChartSeries[];
    empty: string;
    error?: string;
    height?: number;
    testId?: string;
    colors?: readonly string[];
    /**
     * Pin CustomPieChart onSegmentClick parity: the DQ donuts navigate
     * per slice. Off for every other chart (area charts drill via
     * their card buttons) and for display-only donuts, so the pointer
     * cursor never promises a navigation that does not exist.
     */
    segmentClickable?: boolean;
    /**
     * Official DataInsightChartCard: the card title names the chart and
     * the side panel is the legend, so the built-in legend stays off
     * (HIDDEN_CHART_LEGEND = { show: false }).
     */
    hideLegend?: boolean;
    /**
     * Series names to dim to HOVER_CHART_OPACITY (0.3) while another
     * series is hovered in the card's side panel; the hovered series
     * stays at full opacity. Only the DataInsight card passes this.
     */
    dimmedNames?: readonly string[];
    /**
     * Pin `getDataInsightTooltip` (P1-3): when set, the axis tooltip
     * is the formatted one (DATE_MED header, startCase names, rounded
     * values, `%` on percentage graphs). Only the DataInsight card
     * passes this; every other chart keeps the default tooltip.
     * `tooltipLocale` is the app locale the card already carries.
     */
    tooltipPercentage?: boolean;
    tooltipLocale?: string;
  }>(),
  {
    height: 240,
    testId: 'sm-chart',
    segmentClickable: false,
    // Absent on purpose: Vue casts an absent Boolean prop to `false`,
    // which would be indistinguishable from an explicit `false`. The
    // `undefined` default keeps "no insight tooltip" distinct from
    // "insight tooltip, absolute values".
    tooltipPercentage: undefined,
  },
);

const emit = defineEmits<{
  (e: 'segment-click', index: number): void;
}>();

const ready = computed(() => !props.error && hasChartPoints(props.series));
const option = computed(() =>
  props.colors
    ? buildChartOption(props.kind, props.series, props.colors, {
        hideLegend: props.hideLegend,
        dimmedNames: props.dimmedNames ? new Set(props.dimmedNames) : undefined,
        tooltip:
          props.tooltipPercentage !== undefined
            ? { isPercentage: props.tooltipPercentage, locale: props.tooltipLocale }
            : undefined,
      })
    : buildChartOption(props.kind, props.series, undefined, {
        hideLegend: props.hideLegend,
        dimmedNames: props.dimmedNames ? new Set(props.dimmedNames) : undefined,
        tooltip:
          props.tooltipPercentage !== undefined
            ? { isPercentage: props.tooltipPercentage, locale: props.tooltipLocale }
            : undefined,
      }),
);

/**
 * ECharts click → slice index. The donut option (option.ts) builds one
 * pie series whose `data` is the points in order, so `dataIndex` is the
 * slice index in series order — the same index pin's CustomPieChart
 * passes to onSegmentClick. Legend / axis clicks carry a different
 * componentType (or no dataIndex) and are ignored, like pin's
 * non-clickable legend tiles.
 */
function onChartClick(params: { componentType?: string; dataIndex?: unknown }): void {
  if (!props.segmentClickable || props.kind !== 'donut') {
    return;
  }
  if (params.componentType !== 'series' || typeof params.dataIndex !== 'number') {
    return;
  }
  emit('segment-click', params.dataIndex);
}
</script>

<template>
  <div :data-testid="testId" class="sm-chart" :data-kind="kind" :data-points="ready ? '1' : '0'">
    <Alert v-if="error" type="error" show-icon :message="error" />
    <Empty v-else-if="!ready" :description="empty" />
    <VChart
      v-else
      class="sm-chart__canvas"
      :class="{ 'sm-chart__canvas--clickable': props.segmentClickable }"
      :style="{ height: `${height}px` }"
      :option="option"
      autoresize
      @click="onChartClick"
    />
  </div>
</template>

<style scoped>
.sm-chart {
  min-height: 120px;
}
.sm-chart__canvas {
  width: 100%;
}
.sm-chart__canvas--clickable {
  cursor: pointer;
}
</style>
