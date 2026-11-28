<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DatePicker, message } from 'ant-design-vue';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import VChart from 'vue-echarts';
import type { DataContract, DataContractResult } from '@/api/dataContracts';
import { getAllContractResults } from '@/api/dataContracts';
import {
  CONTRACT_EXECUTION_CHART_HEIGHT,
  CONTRACT_EXECUTION_CHART_STATUS,
  CONTRACT_EXECUTION_VISIBLE_RUNS,
  DATA_CONTRACT_EXECUTION_CHART_COMMON_PROPS,
  ES_MAX_PAGE_SIZE,
} from '@/catalog/dataContractConstants';
import { registerCharts } from '@/features/charts/register';
import {
  formatContractDateTimeLong,
  formatContractExecutionDayTick,
  formatContractExecutionTick,
  generateMonthTickPositions,
  getCurrentMillis,
  getEpochMillisForPastDays,
  processContractExecutionData,
  runChartStatus,
} from '@/utils/dataContract';
import { getErrorText } from '@/views/admin/accessApiErrors';

registerCharts();

const props = defineProps<{
  contract: DataContract;
}>();

const { t } = useI18n();
const RANGE_DAYS = 30;
const defaultRange: [Dayjs, Dayjs] = [
  dayjs(getEpochMillisForPastDays(RANGE_DAYS)),
  dayjs(getCurrentMillis()),
];
const dateRange = ref<[Dayjs, Dayjs]>(defaultRange);
const contractExecutionResultList = ref<DataContractResult[]>([]);
const isLoading = ref(true);

async function fetchAllContractResults(): Promise<void> {
  try {
    isLoading.value = true;
    const [start, end] = dateRange.value;
    const results = await getAllContractResults(props.contract.id, {
      startTs: start.valueOf(),
      endTs: end.valueOf(),
      limit: ES_MAX_PAGE_SIZE,
    });
    contractExecutionResultList.value = [...results.data].sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    contractExecutionResultList.value = [];
    message.error(getErrorText(error, t('server.entity-fetch-error', { entity: t('label.execution-history') })));
  } finally {
    isLoading.value = false;
  }
}

const processedChartData = computed(() => processContractExecutionData(contractExecutionResultList.value));
const monthStarts = computed(() => new Set(generateMonthTickPositions(processedChartData.value)));
const isZoomed = computed(() => processedChartData.value.length > CONTRACT_EXECUTION_VISIBLE_RUNS);

const STATUS_COLOR: Record<string, string> = {
  success: 'var(--sm-color-success)',
  failed: 'var(--sm-color-error)',
  warning: 'var(--sm-color-warning)',
  info: 'var(--sm-brand)',
  muted: 'var(--sm-text-quaternary)',
};

const option = computed(() => {
  const data = processedChartData.value;
  return {
    aria: { label: { description: t('label.execution-history') } },
    grid: { left: 8, right: 8, top: 16, bottom: isZoomed.value ? 48 : 32, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (params: { data?: { name?: string; status?: string; displayTimestamp?: number } }) => {
        const row = params?.data;
        if (!row?.status) {
          return '';
        }
        const entry = CONTRACT_EXECUTION_CHART_STATUS[row.status as keyof typeof CONTRACT_EXECUTION_CHART_STATUS];
        const statusLabel = entry ? t(entry.label) : row.status;
        return `<div>${formatContractDateTimeLong(row.displayTimestamp)}<br/>${t('label.contract-execution-status')}: ${statusLabel}</div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: data.map((row) => row.name),
      axisLabel: {
        interval: isZoomed.value
          ? 'auto'
          : (index: number) => monthStarts.value.has(data[index]?.name),
        formatter: (value: string) =>
          isZoomed.value ? formatContractExecutionDayTick(value) : formatContractExecutionTick(value),
      },
    },
    yAxis: { type: 'value', max: 1, axisLabel: { show: false }, splitLine: { show: false } },
    dataZoom: isZoomed.value
      ? [{ type: 'slider', startValue: 0, endValue: CONTRACT_EXECUTION_VISIBLE_RUNS - 1, height: 16 }]
      : undefined,
    series: [
      {
        type: 'bar',
        name: t('label.contract-execution-status'),
        barMaxWidth: DATA_CONTRACT_EXECUTION_CHART_COMMON_PROPS.barMaxWidth,
        data: data.map((row) => ({
          ...row,
          value: 1,
          itemStyle: {
            color: STATUS_COLOR[runChartStatus(row.status)],
            borderRadius: DATA_CONTRACT_EXECUTION_CHART_COMMON_PROPS.radius,
          },
        })),
      },
    ],
  };
});

function onRangeChange(value: [Dayjs, Dayjs] | [string, string] | null): void {
  if (!value || !value[0] || !value[1]) {
    return;
  }
  dateRange.value = [dayjs(value[0]), dayjs(value[1])];
}

watch([dateRange, () => props.contract.id], () => { void fetchAllContractResults(); }, { immediate: true });
</script>

<template>
  <div class="contract-execution-chart-container">
    <div class="contract-execution-data-picker">
      <DatePicker.RangePicker
        v-model:value="dateRange"
        :allow-clear="false"
        @change="onRangeChange"
      />
    </div>
    <div data-testid="contract-execution-chart">
      <VChart
        v-if="!isLoading"
        class="contract-execution-chart"
        :style="{ height: CONTRACT_EXECUTION_CHART_HEIGHT + 'px' }"
        :option="option"
        autoresize
      />
    </div>
  </div>
</template>

<style scoped>
.contract-execution-chart-container { display: flex; flex-direction: column; gap: 12px; }
.contract-execution-data-picker { display: flex; justify-content: flex-end; }
.contract-execution-chart { width: 100%; }
</style>
