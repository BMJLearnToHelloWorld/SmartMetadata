<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons-vue';
import { Badge, Card, Divider, Tooltip } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppRunStatus, AppRunStepStats } from '@/api/apps';
import {
  STATUS_ICON_KEYS,
  formatDateTimeWithTimezone,
  formatLatencyAverage,
  formatThroughput,
} from './appUtils';

const props = withDefaults(
  defineProps<{
    stepStats: AppRunStepStats;
    status?: AppRunStatus;
    timestamp?: number;
    title?: string;
    showStatus?: boolean;
    effectiveTimeMs?: number;
    latencyLabelKey?: string;
  }>(),
  { timestamp: undefined, title: undefined, showStatus: true, effectiveTimeMs: undefined, latencyLabelKey: undefined },
);

const { t } = useI18n();

/**
 * Official AppLogsViewer.statsRender (components/Settings/Applications/
 * AppLogsViewer.tsx, pin a3012259ca): one stats card with an optional
 * status segment, index-state count badges, an optional latency /
 * throughput segment (omitted when the time or the success count is
 * missing), and an optional last-updated segment. Status icons exist
 * only for success/failed/completed (STATUS_ICON_KEYS); the status
 * text is the capitalized raw status.
 */
const showLatency = computed(() => {
  const timeMs = props.effectiveTimeMs ?? props.stepStats.totalTimeMs;
  return (
    timeMs !== undefined &&
    props.stepStats.successRecords !== undefined &&
    props.stepStats.successRecords > 0
  );
});

const latencyText = computed(() => {
  const timeMs = props.effectiveTimeMs ?? props.stepStats.totalTimeMs ?? 0;
  const success = props.stepStats.successRecords ?? 0;
  return `${formatLatencyAverage(timeMs, success)} · ${formatThroughput(timeMs, success)}`;
});

const capitalizedStatus = computed(() =>
  props.status ? props.status.charAt(0).toUpperCase() + props.status.slice(1) : '',
);

const testId = computed(() =>
  props.title ? `stats-component-${props.title.toLowerCase()}` : 'stats-component',
);
</script>

<template>
  <Card :data-testid="testId" size="small">
    <template v-if="title" #title>{{ title }}</template>
    <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px">
      <template v-if="showStatus">
        <span>
          {{ t('label.status') }}:
          <CheckCircleFilled
            v-if="status && STATUS_ICON_KEYS.has(status) && status !== 'failed'"
            :style="{ height: '14px', width: '14px' }"
          />
          <CloseCircleFilled v-else-if="status === 'failed'" :style="{ height: '14px', width: '14px' }" />
          {{ capitalizedStatus }}
        </span>
        <Divider style="height: 0.9em; margin: 0 8px" type="vertical" />
      </template>
      <span>
        {{ t('label.index-states') }}:
        <Tooltip :title="`${t('label.total-index-sent')}: ${stepStats.totalRecords}`">
          <Badge :count="stepStats.totalRecords ?? 0" color="blue" :overflow-count="999999" show-zero />
        </Tooltip>
        <Tooltip
          :title="`${t('label.entity-index', { entity: t('label.success') })}: ${stepStats.successRecords}`"
        >
          <Badge :count="stepStats.successRecords ?? 0" color="green" :overflow-count="999999" show-zero />
        </Tooltip>
        <Tooltip
          :title="`${t('label.entity-index', { entity: t('label.failed') })}: ${stepStats.failedRecords}`"
        >
          <Badge :count="stepStats.failedRecords ?? 0" color="red" :overflow-count="999999" show-zero />
        </Tooltip>
        <Tooltip
          v-if="stepStats.warningRecords !== undefined && stepStats.warningRecords > 0"
          :title="`${t('label.entity-index', { entity: t('label.warning-plural') })}: ${stepStats.warningRecords}`"
        >
          <Badge :count="stepStats.warningRecords" color="orange" :overflow-count="999999" show-zero />
        </Tooltip>
      </span>
      <template v-if="showLatency">
        <Divider style="height: 0.9em; margin: 0 8px" type="vertical" />
        <span>
          {{ t(latencyLabelKey ?? 'label.latency') }}:
          <span data-testid="stage-latency">{{ latencyText }}</span>
        </span>
      </template>
      <template v-if="showStatus">
        <Divider style="height: 0.9em; margin: 0 8px" type="vertical" />
        <span>
          {{ t('label.last-updated') }}:
          {{ timestamp ? formatDateTimeWithTimezone(timestamp) : '--' }}
        </span>
      </template>
    </div>
  </Card>
</template>
