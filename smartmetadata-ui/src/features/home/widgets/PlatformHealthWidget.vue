<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { permissionFlags } from '@/api/permissions';
import { useAddServiceAction } from '@/features/home/useAddServiceAction';
import { serviceTypeIcon } from '@/features/home/serviceTypeIcon';
import { usePermissionStore } from '@/stores/permissions';
import { getRelativeTime } from '@/utils/relativeTime';
import { Tag } from 'ant-design-vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import {
  useBucketServices,
  useIngestionPipelineStats,
  type FailingService,
  type QuietHealthFilter,
  type ServiceHealthFilter,
} from './usePlatformHealth';

const props = defineProps<{
  widgetKey: string;
  isEditView?: boolean;
  handleRemoveWidget?: (widgetKey: string) => void;
}>();

const { t } = useI18n();
const router = useRouter();
const permissions = usePermissionStore();

// The card is a view onto ingestion pipelines, so it opens to whoever may
// view them, not only to admins. The check happens BEFORE the stats hook
// mounts: a viewer who may not read ingestion pipelines must not issue
// the request at all rather than issue it and discard the 403.
const hasViewAccess = ref<boolean | undefined>(undefined);
const enabled = computed(() => hasViewAccess.value === true);

onMounted(async () => {
  const ops = await permissions.getResourcePermission('ingestionPipeline');
  hasViewAccess.value = permissionFlags(ops).hasViewAccess;
});

const { stats, isLoading, isError, dataUpdatedAt, refetch } = useIngestionPipelineStats(enabled);
const { addService, canAddService } = useAddServiceAction('all');

const failingCount = computed(() => stats.value.failedServices + stats.value.warningServices);
const hasVerdict = computed(() => !isLoading.value && !isError.value);
const isHealthy = computed(() => hasVerdict.value && failingCount.value === 0);

const summary = computed(() => {
  if (isError.value) {
    return t('home.widgetLoadFailed');
  }
  return isHealthy.value
    ? t('home.platformHealthAllHealthy', { count: stats.value.connectedServices })
    : t('home.platformHealthFailing', {
        count: failingCount.value,
        total: stats.value.connectedServices,
      });
});

const meta = computed(() =>
  hasVerdict.value && dataUpdatedAt.value > 0
    ? t('home.updatedRelative', { time: getRelativeTime(dataUpdatedAt.value) })
    : undefined,
);

const emptyState = computed(() =>
  stats.value.connectedServices === 0
    ? {
        title: t('home.platformHealthEmptyTitle'),
        description: t('home.platformHealthEmptyDescription'),
        actionLabel: canAddService.value ? t('home.addService') : undefined,
      }
    : undefined,
);

const status = computed(() =>
  hasVerdict.value && !isHealthy.value
    ? { label: t('home.needsAttention'), tone: 'error' as const }
    : undefined,
);

function openServices(): void {
  void router.push({ name: 'ingestion-services' });
}

// The three bucket chips. Each filters the rows below in place; an empty
// bucket has no rows to show, so its chip cannot be picked.
const chips = computed(() => [
  {
    id: 'failing' as ServiceHealthFilter,
    label: t('home.platformHealthFailingCount', {
      count: failingCount.value,
      total: stats.value.connectedServices,
    }),
    disabled: failingCount.value === 0,
  },
  {
    id: 'healthy' as ServiceHealthFilter,
    label: t('home.platformHealthHealthyCount', { count: stats.value.healthyServices }),
    disabled: stats.value.healthyServices === 0,
  },
  {
    id: 'notRun' as ServiceHealthFilter,
    label: t('home.platformHealthNotRunCount', { count: stats.value.pendingServices }),
    disabled: stats.value.pendingServices === 0,
  },
]);

/** The card opens on the worst bucket that has anything in it. */
function defaultBucket(): ServiceHealthFilter {
  if (failingCount.value > 0) {
    return 'failing';
  }
  if (stats.value.healthyServices > 0) {
    return 'healthy';
  }
  if (stats.value.pendingServices > 0) {
    return 'notRun';
  }
  return 'failing';
}

// Unset until the viewer picks one, so the default follows the counts as
// they change rather than freezing on the first response.
const chosenBucket = ref<ServiceHealthFilter | undefined>(undefined);
const bucket = computed<ServiceHealthFilter>(() => chosenBucket.value ?? defaultBucket());
const quietBucket = computed<QuietHealthFilter | undefined>(() =>
  bucket.value === 'failing' ? undefined : bucket.value,
);
const bucketServices = useBucketServices(quietBucket, 3);
// Destructured: template unwrapping only applies to top-level setup
// bindings — `bucketServices.isError` would read the Ref object
// itself (always truthy) instead of the boolean.
const bucketServiceRows = computed(() => bucketServices.services.value);
const bucketIsLoading = bucketServices.isLoading;
const bucketIsError = bucketServices.isError;
const refetchBucket = bucketServices.refetch;

const bucketSize = computed(() =>
  bucket.value === 'failing'
    ? failingCount.value
    : bucket.value === 'healthy'
      ? stats.value.healthyServices
      : stats.value.pendingServices,
);

function pickBucket(next: ServiceHealthFilter): void {
  chosenBucket.value = next;
}

function goToHealth(filter: ServiceHealthFilter): void {
  void router.push({ name: 'ingestion-services', query: { health: filter } });
}

function openService(service: Pick<FailingService, 'fqn' | 'serviceKind'>): void {
  if (!service.serviceKind) {
    openServices();
    return;
  }
  // The product's service detail has no real AGENTS tab — the slot only
  // renders an empty residual — so the row opens the detail page itself.
  // ADR:2026-11-08-my-data-platform-health-service-link
  void router.push({
    name: 'ingestion-service',
    params: { kind: service.serviceKind, id: service.fqn },
  });
}

const PIPELINE_TYPE_LABELS: Record<string, string> = {
  application: 'Application',
  autoClassification: 'Auto Classification',
  dataInsight: 'Data Insight',
  dbt: 'dbt',
  lineage: 'Lineage',
  metadata: 'Metadata',
  profiler: 'Profiler',
  testSuite: 'Test Suite',
  usage: 'Usage',
};

function pipelineTypeLabel(pipelineType: string | undefined): string {
  return (pipelineType && PIPELINE_TYPE_LABELS[pipelineType]) ?? 'Ingestion';
}

/** The line under a failing service's name: the run's own error, else a typed fallback. */
function failingServiceReason(service: FailingService): string {
  return (
    service.reason ||
    t(
      service.state === 'partialSuccess'
        ? 'home.pipelinePartiallyFailed'
        : 'home.pipelineFailed',
      { pipelineType: pipelineTypeLabel(service.pipelineType) },
    )
  );
}

function viewAllLabel(): string {
  if (bucket.value === 'failing') {
    return t('home.platformHealthViewAllFailing', { count: failingCount.value });
  }
  if (bucket.value === 'healthy') {
    return t('home.platformHealthViewAllHealthy', { count: stats.value.healthyServices });
  }
  return t('home.platformHealthViewAllNotRun', { count: stats.value.pendingServices });
}
</script>

<template>
  <HomeWidgetCard
    :title="t('home.platformHealth')"
    test-id="home-widget-platform-health"
    :widget-key="props.widgetKey"
    :is-loading="hasViewAccess === undefined || isLoading"
    :is-error="isError"
    :status="status"
    :summary="hasViewAccess === false ? t('home.noPermissionToView') : summary"
    :meta="meta"
    :empty-state="hasViewAccess === false ? undefined : emptyState"
    @retry="refetch"
    @empty-action="addService"
  >
    <template #extra>
      <button
        class="home-widget-card__link"
        data-testid="platform-health-open-ingestion"
        type="button"
        @click="openServices"
      >
        {{ t('home.openIngestion') }}
      </button>
    </template>
    <template v-if="hasViewAccess !== false && !isError && !emptyState">
      <div
        class="platform-health__chips"
        data-testid="platform-health-chips"
        role="group"
        :aria-label="t('home.platformHealth')"
      >
        <button
          v-for="chip in chips"
          :key="chip.id"
          type="button"
          class="platform-health__chip"
          :class="{ 'platform-health__chip--active': bucket === chip.id }"
          :disabled="chip.disabled"
          :data-testid="`platform-health-chip-${chip.id}`"
          @click="pickBucket(chip.id)"
        >
          {{ chip.label }}
        </button>
      </div>

      <div v-if="bucket === 'failing'">
        <ul v-if="stats.failingServices.length > 0" data-testid="platform-health-rows">
          <li
            v-for="service in stats.failingServices.slice(0, 3)"
            :key="service.id"
            class="platform-health__row"
          >
            <button
              type="button"
              class="platform-health__row-button"
              :data-testid="`failing-service-${service.id}`"
              @click="openService(service)"
            >
              <component :is="serviceTypeIcon(service.serviceType)" class="platform-health__icon" />
              <span class="platform-health__row-text">
                <span class="platform-health__row-name">{{ service.displayName }}</span>
                <span class="platform-health__row-reason">{{ failingServiceReason(service) }}</span>
              </span>
              <Tag v-if="service.pipelineType" color="default">{{
                pipelineTypeLabel(service.pipelineType)
              }}</Tag>
              <span v-if="service.lastRunTs" class="platform-health__row-time">{{
                getRelativeTime(service.lastRunTs)
              }}</span>
            </button>
          </li>
        </ul>
        <button
          v-if="failingCount > 3"
          type="button"
          class="home-widget-card__link"
          data-testid="view-all-failing-services"
          @click="goToHealth('failing')"
        >
          {{ viewAllLabel() }}
        </button>
      </div>

      <div v-else>
        <div
          v-if="bucketIsError"
          data-testid="platform-health-bucket-error"
          class="platform-health__bucket-error"
          role="alert"
        >
          <span>{{ t('home.widgetLoadFailed') }}</span>
          <button
            type="button"
            class="home-widget-card__link"
            data-testid="platform-health-bucket-retry"
            @click="refetchBucket"
          >
            {{ t('shared.retry') }}
          </button>
        </div>
        <div v-else-if="bucketIsLoading" data-testid="platform-health-rows-loading">
          <div class="platform-health__skeleton-bar" style="width: 70%"></div>
          <div class="platform-health__skeleton-bar" style="width: 55%"></div>
          <div class="platform-health__skeleton-bar" style="width: 62%"></div>
        </div>
        <template v-else>
          <ul v-if="bucketServiceRows.length > 0" data-testid="platform-health-rows">
            <li
              v-for="service in bucketServiceRows"
              :key="service.id"
              class="platform-health__row"
            >
              <button
                type="button"
                class="platform-health__row-button"
                :data-testid="`bucket-service-${service.id}`"
                @click="openService(service)"
              >
                <component
                  :is="serviceTypeIcon(service.serviceType)"
                  class="platform-health__icon"
                />
                <span class="platform-health__row-text">
                  <span class="platform-health__row-name">{{ service.displayName }}</span>
                  <span class="platform-health__row-reason">{{ service.serviceType }}</span>
                </span>
                <Tag :color="bucket === 'healthy' ? 'success' : 'default'">{{
                  bucket === 'healthy' ? t('home.healthy') : t('home.notRunYet')
                }}</Tag>
              </button>
            </li>
          </ul>
          <button
            v-if="bucketSize > 3"
            type="button"
            class="home-widget-card__link"
            :data-testid="`view-all-${bucket}-services`"
            @click="goToHealth(bucket)"
          >
            {{ viewAllLabel() }}
          </button>
        </template>
      </div>
    </template>
  </HomeWidgetCard>
</template>

<style scoped>
.platform-health__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.platform-health__chip {
  padding: 2px 10px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 999px;
  background: none;
  color: var(--sm-text-secondary);
  cursor: pointer;
  font-size: 12px;
}
.platform-health__chip--active {
  border-color: var(--sm-brand);
  color: var(--sm-brand);
}
.platform-health__chip:disabled {
  cursor: default;
  opacity: 0.45;
}
.platform-health__row {
  list-style: none;
}
.platform-health__row-button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid var(--sm-border-secondary);
  background: none;
  cursor: pointer;
  text-align: left;
}
.platform-health__row-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}
.platform-health__row-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.platform-health__row-reason {
  overflow: hidden;
  font-size: 12px;
  color: var(--sm-text-tertiary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.platform-health__row-time {
  flex: none;
  font-size: 12px;
  color: var(--sm-text-tertiary);
}
.platform-health__icon {
  width: 20px;
  height: 20px;
  flex: none;
}
.platform-health__bucket-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
.platform-health__skeleton-bar {
  height: 14px;
  margin: 12px 0;
  border-radius: 4px;
  background: var(--sm-border-secondary);
}
</style>
