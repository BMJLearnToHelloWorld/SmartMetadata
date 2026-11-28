<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestSummaryStatusKey.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { STATUS_CHART_COLORS, getStatusChartStatus } from '@/quality/testSummaryGraphUtils';

const props = defineProps<{
  statuses: string[];
}>();

const { t } = useI18n();

const STATUS_ORDER = ['Success', 'Failed', 'Aborted', 'Queued'] as const;

const STATUS_LABEL: Record<string, string> = {
  Success: 'label.success',
  Failed: 'label.failed',
  Aborted: 'label.aborted',
  Queued: 'label.queued',
};

const present = computed(() => {
  const seen = new Set(props.statuses);
  return STATUS_ORDER.filter((status) => seen.has(status));
});
</script>

<template>
  <ul v-if="present.length > 0" class="test-summary-status-key" data-testid="test-summary-status-key">
    <li
      v-for="status in present"
      :key="status"
      class="test-summary-status-key__item"
      :data-testid="`status-key-${status}`"
    >
      <span
        class="test-summary-status-key__dot"
        :class="{ 'test-summary-status-key__dot--hollow': status === 'Aborted' }"
        :style="{
          borderColor: status === 'Aborted' ? STATUS_CHART_COLORS[getStatusChartStatus(status)] : undefined,
          backgroundColor: status === 'Aborted' ? 'transparent' : STATUS_CHART_COLORS[getStatusChartStatus(status)],
        }"
      />
      {{ t(STATUS_LABEL[status] ?? 'label.status') }}
    </li>
  </ul>
</template>

<style scoped>
.test-summary-status-key {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.test-summary-status-key__item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.test-summary-status-key__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}
.test-summary-status-key__dot--hollow {
  border: 2px solid;
}
</style>