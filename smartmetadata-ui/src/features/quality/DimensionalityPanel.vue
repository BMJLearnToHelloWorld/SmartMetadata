<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DimensionalityTab.tsx + DimensionalityHeatmap.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { DatePicker, Select, Tag, Typography } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import SmTable from '@/components/shared/SmTable.vue';
import SmState from '@/components/shared/SmState.vue';
import DimensionalityHeatmap from '@/components/quality/DimensionalityHeatmap.vue';
import { listTestCaseDimensionResults } from '@/api/testCases';
import type { TestCaseDimensionResult } from '@/types/quality';

const props = defineProps<{
  testCaseFqn: string;
  dimensionColumns: string[];
}>();

const { t } = useI18n();
const selected = ref(props.dimensionColumns[0] ?? '');
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
  return Array.from(byValue.entries())
    .map(([value, result]) => ({ value, result }))
    .sort((a, b) => (b.result.impactScore ?? 0) - (a.result.impactScore ?? 0));
});

const columns = computed(() => [
  { title: t('label.status'), dataIndex: 'status', key: 'status' },
  { title: t('quality.testCases.impactScore'), dataIndex: 'impactScore', key: 'impactScore' },
  { title: t('label.dimensionality'), dataIndex: 'value', key: 'value' },
  { title: t('label.last-run'), dataIndex: 'timestamp', key: 'timestamp' },
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
    errorMessage.value = getErrorText(error, t('server.unexpected-error'));
  } finally {
    loading.value = false;
  }
}

function onDateRange(dates: unknown): void {
  const pair = dates as Array<{ valueOf: () => number } | null> | null;
  rangeValue.value =
    pair?.[0] && pair?.[1] ? [dayjs(pair[0].valueOf()), dayjs(pair[1].valueOf())] : null;
  startTs.value = pair?.[0]?.valueOf() ?? startTs.value;
  endTs.value = pair?.[1]?.valueOf() ?? endTs.value;
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
    <p class="entity-detail__tab-lead">{{ t('label.dimensionality') }}</p>
    <div style="display: flex; gap: 16px; margin-bottom: 16px">
      <Select
        v-model:value="selected"
        style="width: 240px"
        data-testid="dimension-select"
        :options="dimensionColumns.map((column) => ({ value: column, label: column }))"
      />
      <DatePicker.RangePicker :value="rangeValue ?? undefined" data-testid="dimensionality-range" @change="onDateRange" />
    </div>
    <SmState v-if="errorMessage" state="error" test-id="dimensionality-error" :error-text="errorMessage" />
    <template v-else-if="loading && rows.length === 0">
      <DimensionalityHeatmap
        :data="[]"
        :start-ts="startTs ?? defaultRange[0].valueOf()"
        :end-ts="endTs ?? defaultRange[1].valueOf()"
        :loading="true"
      />
    </template>
    <SmState
      v-else-if="!loading && rows.length === 0"
      state="empty"
      test-id="dimensionality-empty"
      :empty-text="t('label.no-data')"
    />
    <template v-else>
      <div class="dimensionality-panel__heatmap-card">
        <DimensionalityHeatmap
          :data="rows"
          :start-ts="startTs ?? defaultRange[0].valueOf()"
          :end-ts="endTs ?? defaultRange[1].valueOf()"
          :loading="loading && rows.length === 0"
        />
      </div>
      <Typography.Title :level="5" class="dimensionality-panel__table-title">
        {{ t('label.entity-text-table', { entityText: selected }) }}
      </Typography.Title>
      <SmTable
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
          <span v-if="column.key === 'status'" class="dimensionality-panel__status-cell">
            {{ (record as { status: string }).status }}
            <Tag
              v-if="(record as { excluded?: boolean }).excluded"
              data-testid="excluded-from-roll-up-badge"
            >
              {{ t('label.excluded-from-roll-up') }}
            </Tag>
          </span>
        </template>
      </SmTable>
    </template>
  </div>
</template>

<style scoped>
.dimensionality-panel__heatmap-card {
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid var(--sm-border-color);
  border-radius: 10px;
}
.dimensionality-panel__table-title {
  margin: 0 0 8px !important;
  font-size: 14px !important;
}
.dimensionality-panel__status-cell {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>