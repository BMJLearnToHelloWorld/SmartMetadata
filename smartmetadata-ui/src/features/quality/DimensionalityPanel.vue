<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DatePicker, Select, Typography } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import SmTable from '@/components/shared/SmTable.vue';
import SmState from '@/components/shared/SmState.vue';
import { listTestCaseDimensionResults } from '@/api/testCases';
import type { TestCaseDimensionResult } from '@/types/quality';

/**
 * Dimensionality tab (official DimensionalityTab.tsx + its heatmap table
 * columns: status / impactScore / dimensionValue / lastRun). The dimension
 * selector comes from the test case's dimensionColumns; the table keeps
 * the latest result per dimension value (official
 * getLatestResultPerDimension: latest date wins, ties broken by latest
 * timestamp), sorted by impactScore descending. The heatmap itself is
 * not built here — the table is the tab's data surface; a heatmap cell
 * grid would duplicate the same rows without new data.
 */
const props = defineProps<{
  testCaseFqn: string;
  dimensionColumns: string[];
}>();

const { t } = useI18n();
const selected = ref(props.dimensionColumns[0] ?? '');
// Official DEFAULT_RANGE_DATA (profiler.constant.ts): last 7 days —
// start of day 7 days ago through end of today. The picker starts on
// this range; clearing it removes the bounds.
const defaultRange: [Dayjs, Dayjs] = [dayjs().subtract(7, 'day').startOf('day'), dayjs().endOf('day')];
const rangeValue = ref<[Dayjs, Dayjs] | null>(defaultRange);
const startTs = ref<number | undefined>(defaultRange[0].valueOf());
const endTs = ref<number | undefined>(defaultRange[1].valueOf());
const rows = ref<TestCaseDimensionResult[]>([]);
const loading = ref(false);
const errorMessage = ref('');

const latestRows = computed(() => {
  const byValue = new Map<string, TestCaseDimensionResult>();
  for (const row of rows.value) {
    const value = row.dimensionValues.map((item) => item.value).join(', ');
    const existing = byValue.get(value);
    if (!existing) {
      byValue.set(value, row);
      continue;
    }
    const rowDay = row.timestamp ? new Date(row.timestamp).toISOString().slice(0, 10) : '';
    const existingDay = existing.timestamp ? new Date(existing.timestamp).toISOString().slice(0, 10) : '';
    if (rowDay > existingDay || (rowDay === existingDay && (row.timestamp ?? 0) > (existing.timestamp ?? 0))) {
      byValue.set(value, row);
    }
  }
  return [...byValue.entries()]
    .map(([value, result]) => ({ value, result }))
    .sort((a, b) => (b.result.impactScore ?? 0) - (a.result.impactScore ?? 0));
});

const columns = computed(() => [
  { title: t('crud.status'), dataIndex: 'status', key: 'status' },
  { title: t('quality.testCases.impactScore'), dataIndex: 'impactScore', key: 'impactScore' },
  { title: t('quality.tabs.dimensionality'), dataIndex: 'value', key: 'value' },
  { title: t('quality.testCases.timestamp'), dataIndex: 'timestamp', key: 'timestamp' },
]);

async function load(): Promise<void> {
  if (!props.testCaseFqn || !selected.value) {
    rows.value = [];
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTestCaseDimensionResults(props.testCaseFqn, {
      dimensionName: selected.value,
      startTs: startTs.value,
      endTs: endTs.value,
    });
    rows.value = page.data;
  } catch (error) {
    rows.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onDateRange(dates: unknown): void {
  const pair = dates as Array<{ valueOf: () => number } | null> | null;
  rangeValue.value =
    pair?.[0] && pair?.[1] ? [dayjs(pair[0].valueOf()), dayjs(pair[1].valueOf())] : null;
  startTs.value = pair?.[0]?.valueOf();
  endTs.value = pair?.[1]?.valueOf();
  void load();
}

watch(selected, () => {
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="test-case-dimensionality">
    <p class="entity-detail__tab-lead">{{ t('quality.testCases.dimensionalityLead') }}</p>
    <div style="display: flex; gap: 16px; margin-bottom: 16px">
      <Select
        v-model:value="selected"
        style="width: 240px"
        data-testid="dimensionality-select"
        :options="dimensionColumns.map((column) => ({ value: column, label: column }))"
      />
      <DatePicker.RangePicker :value="rangeValue ?? undefined" data-testid="dimensionality-range" @change="onDateRange" />
    </div>
    <SmState v-if="errorMessage" state="error" test-id="dimensionality-error" :error-text="errorMessage" />
    <SmState
      v-else-if="!loading && latestRows.length === 0"
      state="empty"
      test-id="dimensionality-empty"
      :empty-text="t('quality.testCases.noDimensionData')"
    />
    <SmTable
      v-else
      row-key="value"
      size="small"
      :columns="columns"
      :data-source="
        latestRows.map((row) => ({
          value: row.value,
          status: row.result.testCaseStatus || '—',
          impactScore: row.result.impactScore ?? '—',
          timestamp: row.result.timestamp ? new Date(row.result.timestamp).toISOString() : '—',
          excluded: row.result.excludedFromRollUp,
        }))
      "
      :loading="loading"
      :pagination="false"
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'status'">
          {{ (record as { status: string }).status }}
          <Typography.Text v-if="(record as { excluded?: boolean }).excluded" type="secondary">
            {{ t('quality.testCases.excludedFromRollUp') }}
          </Typography.Text>
        </span>
      </template>
    </SmTable>
  </div>
</template>
