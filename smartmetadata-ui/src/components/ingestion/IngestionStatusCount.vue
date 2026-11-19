<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getReadableCountString } from '@/components/ingestion/insights/serviceInsightsUtils';
import type { PipelineStepStatus } from '@/types/ingestion';

const props = defineProps<{
  /** Latest run's first step summary; absent summaries count as zero. */
  summary?: PipelineStepStatus | null;
  runId?: string;
}>();

const { t } = useI18n();

/**
 * Port of official getIngestionStatusCountData (pin a3012259ca):
 * Success = records + updated_records, Failed = errors,
 * Warning = warnings, compact 1-decimal counts. Three tiles always
 * render, even when the summary is absent (all zeros).
 */
const records = computed(() => [
  {
    type: 'success',
    label: t('settings.services.pipeline.countSuccess'),
    value: getReadableCountString(
      (props.summary?.records ?? 0) + (props.summary?.updated_records ?? 0),
      1,
    ),
  },
  {
    type: 'failed',
    label: t('settings.services.pipeline.countFailed'),
    value: getReadableCountString(props.summary?.errors ?? 0, 1),
  },
  {
    type: 'warning',
    label: t('settings.services.pipeline.countWarning'),
    value: getReadableCountString(props.summary?.warnings ?? 0, 1),
  },
]);
</script>

<template>
  <div class="ingestion-status-count">
    <div
      v-for="record in records"
      :key="`${record.type}-${runId ?? ''}`"
      :class="['ingestion-status-count__tile', `ingestion-status-count__tile--${record.type}`]"
      :data-testid="`${record.type}-count`"
    >
      <span class="ingestion-status-count__value">{{ record.value }}</span>
      <span class="ingestion-status-count__label">{{ record.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.ingestion-status-count {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

.ingestion-status-count__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  padding: 6px 12px;
}

.ingestion-status-count__value {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.ingestion-status-count__label {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
}

.ingestion-status-count__tile--success .ingestion-status-count__value {
  color: var(--sm-color-success);
}

.ingestion-status-count__tile--failed .ingestion-status-count__value {
  color: var(--sm-color-error);
}

.ingestion-status-count__tile--warning .ingestion-status-count__value {
  color: var(--sm-color-warning);
}
</style>
