<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Select, Tag } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import {
  DATA_QUALITY_RANGES,
  DEFAULT_DATA_QUALITY_FILTERS,
  type DataQualityFilters,
  type DataQualityRange,
  type DataQualityScope,
} from '@/catalog/dataQualityFilters';
import { incidentStatusLabel } from '@/features/crud/incidentStatus';
import { useAuthStore } from '@/stores/auth';
import { assetLocation } from '@/catalog/entityRoutes';
import { useDataQualitySummary } from './useDataQualitySummary';
import {
  getTestColumnName,
  getTestTableFqn,
  groupTestsByTable,
  type DataQualityGroupBy,
} from './dataQualityTestRows';
import { toTableCountsKey, type TableStatusCounts } from '@/catalog/dataQualityFilters';
import type { TestCase } from '@/types/quality';

const props = defineProps<{ widgetKey: string }>();

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();

const filters = ref<DataQualityFilters>({ ...DEFAULT_DATA_QUALITY_FILTERS });
// Arranges the rows, not a query filter: the same tests either way.
const groupBy = ref<DataQualityGroupBy>('table');

const viewer = computed(() =>
  auth.user
    ? {
        id: auth.user.id ?? '',
        teamIds: (auth.user.teams ?? []).map((team) => team.id ?? '').filter(Boolean),
      }
    : undefined,
);

const {
  passed,
  failed,
  aborted,
  total,
  tests,
  tableCounts,
  hasNoTests,
  isError,
  isLoading,
  refetch,
} = useDataQualitySummary(
  computed(() => filters.value),
  auth.user?.name,
  viewer.value,
);

const scopeOptions = computed(() => [
  { label: t('home.allData'), value: 'all' as DataQualityScope },
  { label: t('home.myData'), value: 'mine' as DataQualityScope },
  { label: t('home.followed'), value: 'followed' as DataQualityScope },
]);
const rangeOptions = computed(() =>
  DATA_QUALITY_RANGES.map((days) => ({
    label: t('home.lastNDays', { count: Number(days) }),
    value: days as DataQualityRange,
  })),
);
const groupOptions = computed(() => [
  { label: t('home.table'), value: 'table' as DataQualityGroupBy },
  { label: t('home.testCase'), value: 'testCase' as DataQualityGroupBy },
]);

// Against the bucket total, not the rows shown: the rows are the latest
// results, and "N more" is the rest of the failing bucket.
const shownFailures = computed(
  () => tests.value.filter((test) => test.testCaseResult?.testCaseStatus === 'Failed').length,
);
const hiddenFailures = computed(() => Math.max(0, failed.value - shownFailures.value));

// Offered whatever the viewer's role, as on the Data Quality page it opens:
// whether a test may be added depends on the table picked there.
const emptyState = computed(() =>
  hasNoTests.value
    ? {
        title: t('home.noTestCasesYet'),
        description: t('home.dataQualityEmptyDescription'),
        summary: t('home.dataQualityWidgetDescription'),
        actionLabel: t('home.createTest'),
      }
    : undefined,
);

const status = computed(() =>
  failed.value > 0
    ? { label: t('home.countFailedTests', { count: failed.value }), tone: 'error' as const }
    : undefined,
);

const groups = computed(() => groupTestsByTable(tests.value));

/** The table's counts across the card's scope, or the rows shown without them. */
function countsFor(group: { tableFqn: string; passed: number; failed: number; aborted: number }): TableStatusCounts {
  return tableCounts.value[toTableCountsKey(group.tableFqn)] ?? group;
}

function lastFqnPart(fqn: string): string {
  return fqn.split('.').pop() ?? fqn;
}

function statusTone(statusValue?: string): 'success' | 'error' | 'warning' | 'default' {
  if (statusValue === 'Failed') return 'error';
  if (statusValue === 'Aborted') return 'warning';
  if (statusValue === 'Success') return 'success';
  return 'default';
}

function statusLabel(statusValue?: string): string {
  if (statusValue === 'Failed') return t('home.failed');
  if (statusValue === 'Aborted') return t('home.aborted');
  if (statusValue === 'Success') return t('home.passed');
  return statusValue ?? '';
}

function canRaiseIncident(test: TestCase): boolean {
  return test.testCaseResult?.testCaseStatus === 'Aborted' && !test.incidentStatus;
}

function openTest(test: TestCase): void {
  void router.push({ name: 'quality-test-case', params: { id: test.id } });
}

function openDataQuality(): void {
  void router.push({ name: 'quality-test-cases' });
}

const barSegments = computed(() => {
  const totalValue = total.value || 1;
  return [
    { key: 'passed', count: passed.value, pct: (passed.value / totalValue) * 100, color: '#52c41a' },
    { key: 'failed', count: failed.value, pct: (failed.value / totalValue) * 100, color: '#ff4d4f' },
    { key: 'aborted', count: aborted.value, pct: (aborted.value / totalValue) * 100, color: '#faad14' },
  ];
});
</script>

<template>
  <HomeWidgetCard
    :title="t('home.dataQuality')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="status"
    :summary="t('home.countTestsCountFailed', { count: total, failed })"
    :meta="hiddenFailures > 0 ? t('home.countMoreFailingTests', { count: hiddenFailures }) : undefined"
    :empty-state="emptyState"
    @retry="refetch"
    @empty-action="openDataQuality"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="openDataQuality">
        {{ t('home.openDataQuality') }}
      </button>
    </template>
    <template v-if="!emptyState">
      <div class="data-quality__filters">
        <Select
          data-testid="dq-scope-filter"
          :value="filters.scope"
          :options="scopeOptions"
          size="small"
          @change="(value) => (filters = { ...filters, scope: value as DataQualityScope })"
        />
        <Select
          data-testid="dq-range-filter"
          :value="filters.range"
          :options="rangeOptions"
          size="small"
          @change="(value) => (filters = { ...filters, range: value as DataQualityRange })"
        />
        <Select
          data-testid="dq-group-by"
          :value="groupBy"
          :options="groupOptions"
          size="small"
          @change="(value) => (groupBy = value as DataQualityGroupBy)"
        />
      </div>

      <div class="data-quality__bar" data-testid="data-quality-status-bar" aria-hidden="true">
        <span
          v-for="segment in barSegments"
          :key="segment.key"
          :style="{ width: `${segment.pct}%`, background: segment.color }"
        />
      </div>
      <p class="data-quality__bar-counts" data-testid="data-quality-status-counts">
        {{
          t('home.testStatusCounts', {
            passed: passed,
            failed: failed,
            aborted: aborted,
          })
        }}
      </p>

      <p v-if="tests.length === 0" class="data-quality__no-rows" data-testid="data-quality-empty">
        {{ total === 0 ? t('home.noTestResultsYet') : t('home.noFailingTests') }}
      </p>

      <ul v-else-if="groupBy === 'testCase'" class="data-quality__rows" data-testid="data-quality-rows">
        <li
          v-for="test in tests"
          :key="test.id"
          class="data-quality__row"
          :data-testid="`dq-test-${test.id}`"
        >
          <div class="data-quality__row-main">
            <span class="data-quality__row-title">
              <span class="data-quality__row-name">{{ test.displayName ?? test.name }}</span>
              <Tag
                v-if="test.testCaseResult?.testCaseStatus"
                :color="statusTone(test.testCaseResult.testCaseStatus)"
              >
                {{ statusLabel(test.testCaseResult.testCaseStatus) }}
              </Tag>
            </span>
            <span v-if="getTestTableFqn(test.entityLink)" class="data-quality__row-meta">
              {{ getTestTableFqn(test.entityLink) }}
            </span>
            <span v-if="test.incidentStatus" class="data-quality__row-meta" :data-testid="`dq-incident-${test.id}`">
              {{ t('home.incidentWithStatus', { status: incidentStatusLabel(t, test.incidentStatus) }) }}
            </span>
          </div>
          <button
            type="button"
            class="home-widget-card__link"
            :data-testid="canRaiseIncident(test) ? `dq-raise-incident-${test.id}` : `dq-view-test-${test.id}`"
            @click="openTest(test)"
          >
            {{ canRaiseIncident(test) ? t('home.raiseIncident') : t('home.viewTest') }}
          </button>
        </li>
      </ul>

      <div v-else class="data-quality__groups" data-testid="data-quality-rows">
        <section
          v-for="group in groups"
          :key="group.tableFqn"
          :aria-label="group.tableFqn"
          :data-testid="`dq-table-group-${group.tableFqn}`"
        >
          <div class="data-quality__group-header">
            <router-link
              class="data-quality__group-name"
              :to="assetLocation('table', group.tableFqn)"
            >
              {{ lastFqnPart(group.tableFqn) }}
            </router-link>
            <span class="data-quality__group-fqn">{{ group.tableFqn }}</span>
            <span class="data-quality__group-counts">
              <span v-if="countsFor(group).passed > 0" class="data-quality__count--passed">
                {{ t('home.countPassedTests', { count: countsFor(group).passed }) }}
              </span>
              <span v-if="countsFor(group).failed > 0" class="data-quality__count--failed">
                {{ t('home.countFailedTests', { count: countsFor(group).failed }) }}
              </span>
              <span v-if="countsFor(group).aborted > 0" class="data-quality__count--aborted">
                {{ t('home.countAbortedTests', { count: countsFor(group).aborted }) }}
              </span>
            </span>
          </div>
          <ul class="data-quality__rows">
            <li
              v-for="test in group.tests"
              :key="test.id"
              class="data-quality__row"
              :data-testid="`dq-test-${test.id}`"
            >
              <div class="data-quality__row-main">
                <span class="data-quality__row-title">
                  <span class="data-quality__row-name">{{ test.displayName ?? test.name }}</span>
                  <Tag
                    v-if="test.testCaseResult?.testCaseStatus"
                    :color="statusTone(test.testCaseResult.testCaseStatus)"
                  >
                    {{ statusLabel(test.testCaseResult.testCaseStatus) }}
                  </Tag>
                </span>
                <span v-if="getTestColumnName(test.entityLink)" class="data-quality__row-meta">
                  {{ getTestColumnName(test.entityLink) }}
                </span>
                <span v-if="test.incidentStatus" class="data-quality__row-meta" :data-testid="`dq-incident-${test.id}`">
                  {{ t('home.incidentWithStatus', { status: incidentStatusLabel(t, test.incidentStatus) }) }}
                </span>
              </div>
              <button
                type="button"
                class="home-widget-card__link"
                :data-testid="canRaiseIncident(test) ? `dq-raise-incident-${test.id}` : `dq-view-test-${test.id}`"
                @click="openTest(test)"
              >
                {{ canRaiseIncident(test) ? t('home.raiseIncident') : t('home.viewTest') }}
              </button>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </HomeWidgetCard>
</template>

<style scoped>
.data-quality__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.data-quality__bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: #f0f0f0;
}

.data-quality__bar span {
  display: block;
  height: 100%;
}

.data-quality__bar-counts {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.data-quality__no-rows {
  margin: 16px 0 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.data-quality__rows {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.data-quality__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.data-quality__row:last-child {
  border-bottom: 0;
}

.data-quality__row-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.data-quality__row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.data-quality__row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.data-quality__row-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.data-quality__groups {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
}

.data-quality__group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  background: #f5f5f5;
  padding: 8px 12px;
}

.data-quality__group-name {
  font-size: 12px;
  font-weight: 600;
  color: #005587;
  text-decoration: none;
  white-space: nowrap;
}

.data-quality__group-fqn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.data-quality__group-counts {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
}

.data-quality__count--passed {
  color: #52c41a;
}

.data-quality__count--failed {
  color: #ff4d4f;
}

.data-quality__count--aborted {
  color: #faad14;
}
</style>
