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
  }>(),
  {
    height: 240,
    testId: 'sm-chart',
  },
);

const ready = computed(() => !props.error && hasChartPoints(props.series));
const option = computed(() =>
  props.colors ? buildChartOption(props.kind, props.series, props.colors) : buildChartOption(props.kind, props.series),
);
</script>

<template>
  <div :data-testid="testId" class="sm-chart" :data-kind="kind" :data-points="ready ? '1' : '0'">
    <Alert v-if="error" type="error" show-icon :message="error" />
    <Empty v-else-if="!ready" :description="empty" />
    <VChart v-else class="sm-chart__canvas" :style="{ height: `${height}px` }" :option="option" autoresize />
  </div>
</template>

<style scoped>
.sm-chart {
  min-height: 120px;
}
.sm-chart__canvas {
  width: 100%;
}
</style>
