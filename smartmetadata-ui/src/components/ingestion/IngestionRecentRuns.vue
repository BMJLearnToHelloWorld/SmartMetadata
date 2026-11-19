<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Skeleton, Tag, Tooltip } from 'ant-design-vue';
import { runBadgeColor } from '@/ingestion/pipelineDisplay';
import type { PipelineStatus } from '@/types/ingestion';
import IngestionRunDetailsModal from '@/views/ingestion/IngestionRunDetailsModal.vue';

const props = defineProps<{
  /** Run statuses (the pipeline's `pipelineStatuses`); fetchStatus=false mode. */
  statuses?: PipelineStatus[];
  loading?: boolean;
}>();

const { t } = useI18n();
const selectedStatus = ref<PipelineStatus | undefined>(undefined);

/**
 * Port of official IngestionRecentRuns (pin a3012259ca), appRuns
 * branch: sort by timestamp ascending, take the last 5. The input
 * array is copied first — the pin sorts the prop in place.
 */
const recentRuns = computed(() =>
  [...(props.statuses ?? [])]
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .slice(-5),
);

function upperFirst(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function hasTooltipTime(status: PipelineStatus): boolean {
  return (
    typeof status.endDate === 'number' ||
    typeof status.startDate === 'number' ||
    typeof status.timestamp === 'number'
  );
}

function formatRunDate(timestamp: number | undefined): string {
  return timestamp === undefined ? '' : new Date(timestamp).toLocaleString();
}
</script>

<template>
  <Skeleton.Button v-if="loading" active size="small" style="width: 120px" />
  <div v-else class="ingestion-recent-runs">
    <span v-if="recentRuns.length === 0" data-testid="pipeline-status">--</span>
    <template v-else>
      <span v-for="(status, index) in recentRuns" :key="status.runId ?? index">
        <Tooltip v-if="hasTooltipTime(status)">
          <template #title>
            <div class="ingestion-recent-runs__tooltip">
              <p v-if="status.timestamp">
                {{ t('settings.services.pipeline.tooltip.executionDate') }}:
                {{ formatRunDate(status.timestamp) }}
              </p>
              <p v-if="status.startDate">
                {{ t('settings.services.pipeline.tooltip.startDate') }}:
                {{ formatRunDate(status.startDate) }}
              </p>
              <p v-if="status.endDate">
                {{ t('settings.services.pipeline.tooltip.endDate') }}:
                {{ formatRunDate(status.endDate) }}
              </p>
            </div>
          </template>
          <Tag
            :color="runBadgeColor(status.pipelineState)"
            data-testid="pipeline-status"
            style="cursor: pointer"
            @click="selectedStatus = status"
          >
            {{ index === recentRuns.length - 1 ? upperFirst(status.pipelineState) : '' }}
          </Tag>
        </Tooltip>
        <Tag
          v-else
          :color="runBadgeColor(status.pipelineState)"
          data-testid="pipeline-status"
          style="cursor: pointer"
          @click="selectedStatus = status"
        >
          {{ index === recentRuns.length - 1 ? upperFirst(status.pipelineState) : '' }}
        </Tag>
      </span>
    </template>
    <IngestionRunDetailsModal
      :open="selectedStatus !== undefined"
      :status="selectedStatus ?? null"
      @close="selectedStatus = undefined"
    />
  </div>
</template>

<style scoped>
.ingestion-recent-runs {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ingestion-recent-runs__tooltip p {
  margin: 0;
  text-align: left;
}
</style>
