<template>
  <HomeWidgetCard
    :title="t('home.pipelineStatus')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="status"
    :summary="summary"
    :meta="remaining > 0 ? t('home.moreCount', { count: remaining }) : undefined"
    :empty-state="emptyState"
    @retry="refetch"
    @empty-action="addService"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="openPipelines">
        {{ t('home.openPipelines') }}
      </button>
    </template>
    <div class="pipeline-status__chips" role="group" :aria-label="t('home.pipelineStatus')">
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="pipeline-status__chip"
        :class="{ 'pipeline-status__chip--active': bucket === chip.id }"
        :aria-pressed="bucket === chip.id"
        :data-testid="`pipeline-status-chip-${chip.id}`"
        @click="bucket = chip.id"
      >
        {{ chip.label }} ({{ chip.count }})
      </button>
    </div>
    <ul class="pipeline-status__list" data-testid="pipeline-status-list">
      <li
        v-for="pipeline in visibleRows"
        :key="pipeline.pipelineId"
        class="pipeline-status__row"
        :data-testid="`pipeline-status-row-${pipeline.pipelineId}`"
      >
        <div class="pipeline-status__row-main">
          <button
            type="button"
            class="pipeline-status__name"
            :data-testid="`pipeline-status-row-name-${pipeline.pipelineId}`"
            @click="openPipeline(pipeline)"
          >
            {{ pipeline.pipelineName ?? pipeline.pipelineFqn }}
          </button>
          <span
            v-if="pipeline.lastRunStatus"
            class="pipeline-status__badge"
            :data-testid="`pipeline-status-row-status-${pipeline.pipelineId}`"
          >
            {{ t(`home.pipelineLastRun${pipeline.lastRunStatus}`) }}
          </span>
          <span
            class="pipeline-status__runs"
            :data-testid="`pipeline-status-row-runs-${pipeline.pipelineId}`"
            aria-hidden="true"
          >
            <i
              v-for="run in runsByFqn[pipeline.pipelineFqn] ?? []"
              :key="run.timestamp"
              class="pipeline-status__dot"
              :class="`pipeline-status__dot--${runDotTone(run.executionStatus)}`"
            />
          </span>
        </div>
        <p
          v-if="pipelineMeta(pipeline)"
          class="pipeline-status__meta"
          :data-testid="`pipeline-status-row-meta-${pipeline.pipelineId}`"
        >
          {{ pipelineMeta(pipeline) }}
        </p>
        <p
          v-if="latestRunError(pipeline)"
          class="pipeline-status__error"
          :data-testid="`pipeline-status-row-error-${pipeline.pipelineId}`"
        >
          {{ latestRunError(pipeline) }}
        </p>
      </li>
    </ul>
  </HomeWidgetCard>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import HomeWidgetCard from '@/features/home/HomeWidgetCard.vue';
import {
  ALL_PIPELINES,
  PIPELINE_STATUS_BUCKETS,
  usePipelineRunHistory,
  usePipelineStatus,
  type PipelineStatusBucket,
} from '@/features/home/widgets/usePipelineStatus';
import { useAddServiceAction } from '@/features/home/useAddServiceAction';
import { formatServiceTypeLabel } from '@/features/home/widgets/useDataEstate';
import { getRelativeTime } from '@/utils/relativeTime';
import { convertMillisecondsToHumanReadableFormat } from '@/utils/workflowDateTime';
import type { PipelineSummary } from '@/api/pipelines';

const props = defineProps<{ widgetKey: string }>();

const { t } = useI18n();
const router = useRouter();

const { rows, counts, isLoading, isError, refetch } = usePipelineStatus();
const bucket: Ref<PipelineStatusBucket> = ref(ALL_PIPELINES);
const visibleRows = computed(() => rows.value[bucket.value]);
const { runsByFqn, loadHistory } = usePipelineRunHistory(
  computed(() => visibleRows.value.map((row) => row.pipelineFqn)),
);
const { addService, canAddService } = useAddServiceAction('pipeline');

const total = computed(() => counts.value[ALL_PIPELINES]);
const failedCount = computed(() => counts.value.Failed);
const remaining = computed(() => Math.max(0, counts.value[bucket.value] - visibleRows.value.length));

const chips = computed(() => [
  { id: ALL_PIPELINES as PipelineStatusBucket, label: t('home.all'), count: total.value },
  ...PIPELINE_STATUS_BUCKETS.map((status) => ({
    id: status as PipelineStatusBucket,
    label: t(`home.pipelineLastRun${status}`),
    count: counts.value[status],
  })),
]);

const summary = computed(() =>
  failedCount.value > 0
    ? t('home.pipelinesFailedLastRun', { count: failedCount.value, total: total.value })
    : t('home.noPipelineFailedLastRun', { count: total.value }),
);

// Official TopicCard status: an error chip "{count} failed" while any
// pipeline failed its last run, nothing otherwise.
const status = computed(() =>
  failedCount.value > 0
    ? { label: t('home.pipelinesFailed', { count: failedCount.value }), tone: 'error' as const }
    : undefined,
);

const emptyState = computed(() =>
  total.value === 0
    ? {
        title: t('home.noPipelineRunsYet'),
        description: t('home.pipelineStatusEmptyDescription'),
        actionLabel: canAddService.value ? t('home.addPipelineService') : undefined,
      }
    : undefined,
);

watch(
  visibleRows,
  (next) => {
    void loadHistory(next.map((row) => row.pipelineFqn));
  },
  { immediate: true },
);

function runDotTone(executionStatus: string): string {
  if (executionStatus === 'Failed') {
    return 'failed';
  }
  if (executionStatus === 'Successful') {
    return 'success';
  }
  return 'other';
}

/**
 * Official PipelineStatusRow meta: service type · relative time ·
 * duration (at most 2 units, "1h 4m"), from the summary's own
 * start/end times. Empty parts drop out, exactly like official's
 * `.filter(Boolean).join(' · ')`.
 */
function pipelineMeta(pipeline: PipelineSummary): string | undefined {
  const parts = [
    pipeline.serviceType ? formatServiceTypeLabel(pipeline.serviceType) : undefined,
    pipeline.lastRunTime ? getRelativeTime(pipeline.lastRunTime) : undefined,
    pipeline.startTime && pipeline.endTime && pipeline.endTime > pipeline.startTime
      ? convertMillisecondsToHumanReadableFormat(pipeline.endTime - pipeline.startTime, 2)
      : undefined,
  ].filter((part): part is string => part !== undefined && part !== '');
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * Official PipelineStatusRow error: the latest run's error message,
 * shown only when the last run failed, truncated to 3 lines. Runs are
 * oldest first, so the latest run is the last one.
 */
function latestRunError(pipeline: PipelineSummary): string | undefined {
  if (pipeline.lastRunStatus !== 'Failed') {
    return undefined;
  }
  const runs = runsByFqn.value[pipeline.pipelineFqn] ?? [];
  return runs.length > 0 ? runs[runs.length - 1].errorMessage : undefined;
}

function openPipelines(): void {
  void router.push({ name: 'search', query: { tab: 'pipelines' } });
}

function openPipeline(pipeline: PipelineSummary): void {
  void router.push({ name: 'search', query: { q: pipeline.pipelineFqn, tab: 'pipelines' } });
}
</script>

<style scoped>
.pipeline-status__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.pipeline-status__chip {
  border: 1px solid var(--sm-border, #d9d9d9);
  border-radius: 999px;
  background: transparent;
  padding: 2px 10px;
  cursor: pointer;
  font-size: 12px;
}

.pipeline-status__chip--active {
  border-color: #005587;
  color: #005587;
  font-weight: 600;
}

.pipeline-status__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pipeline-status__row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pipeline-status__row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.pipeline-status__name {
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  color: inherit;
}

.pipeline-status__badge {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.pipeline-status__meta {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.pipeline-status__error {
  margin: 2px 0 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: #fff1f0;
  color: #cf1322;
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pipeline-status__runs {
  display: inline-flex;
  gap: 3px;
  flex-shrink: 0;
}

.pipeline-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d9d9d9;
}

.pipeline-status__dot--success {
  background: #52c41a;
}

.pipeline-status__dot--failed {
  background: #ff4d4f;
}
</style>
