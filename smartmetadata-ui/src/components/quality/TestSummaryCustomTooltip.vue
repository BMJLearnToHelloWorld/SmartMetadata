<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestSummaryCustomTooltip (Vue subset).
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { PLACED_KEYS_FIELD, type TestSummaryChartPoint } from '@/quality/testSummaryGraphUtils';
import { getIncidentTaskPath, getTaskDisplayId } from '@/quality/testCaseLastRunBanner.utils';
import type { TestSummaryIncidentTask } from '@/quality/testSummaryGraphUtils';
import { formatContractDateTime } from '@/utils/dataContract';

const props = defineProps<{
  point: TestSummaryChartPoint;
}>();

const { t } = useI18n();

const OMITTED = new Set(['name', 'status', 'incidentId', 'task', 'passedRows', 'failedRows', 'boundArea', PLACED_KEYS_FIELD]);

const formattedTime = computed(() => formatContractDateTime(Number(props.point.name)));

const rows = computed(() => {
  const placedKeys = (props.point[PLACED_KEYS_FIELD] as string[] | undefined) ?? [];
  return Object.entries(props.point).filter(([key, value]) => {
    if (OMITTED.has(key) || placedKeys.includes(key)) {
      return false;
    }
    return typeof value === 'number' || typeof value === 'string';
  });
});

const task = computed(() => props.point.task as TestSummaryIncidentTask | undefined);
const incidentPath = computed(() => (task.value?.id ? getIncidentTaskPath(task.value.id) : undefined));
const incidentLabel = computed(() =>
  task.value
    ? getTaskDisplayId(task.value.taskId?.id || task.value.displayName || task.value.id)
    : '',
);
</script>

<template>
  <div class="test-summary-tooltip" data-testid="test-summary-custom-tooltip">
    <div class="test-summary-tooltip__header">
      <span :data-status="point.status">{{ point.status }}</span>
      <span class="test-summary-tooltip__time">{{ formattedTime }}</span>
    </div>
    <ul class="test-summary-tooltip__rows">
      <li v-for="[key, value] in rows" :key="key">
        <span>{{ key }}</span>
        <span :data-testid="key">{{ value }}</span>
      </li>
    </ul>
    <div v-if="incidentPath" class="test-summary-tooltip__incident">
      <RouterLink :to="incidentPath">{{ t('label.incident') }} {{ incidentLabel }}</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.test-summary-tooltip {
  min-width: 200px;
  max-width: 320px;
  border: 1px solid var(--sm-border-color, #d9d9d9);
  border-radius: 12px;
  background: var(--sm-bg-container, #fff);
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.12);
  padding: 12px;
  font-size: 13px;
}
.test-summary-tooltip__header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 600;
}
.test-summary-tooltip__time {
  color: var(--sm-text-secondary);
  font-weight: 400;
}
.test-summary-tooltip__rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.test-summary-tooltip__rows li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
}
.test-summary-tooltip__incident {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--sm-border-color, #eee);
}
</style>