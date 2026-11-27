<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DataObservabilityTab (Table page Profiler tab): sub-tabs
  Table Profile, Column Profile, Data Quality, and Incidents, plus
  official TabFilters chrome at this parent. Vue3 + ant-design-vue.
  No CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Tabs } from 'ant-design-vue';
import type { OperationPermissions } from '@/api/permissions';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { listTableCustomMetrics, type CustomMetricRecord } from '@/api/customMetrics';
import { getDataQualityReport } from '@/api/dataQualityReports';
import { usePermissionStore } from '@/stores/permissions';
import AssetDataQualityTab from '@/components/quality/AssetDataQualityTab.vue';
import ColumnProfileTable from '@/components/quality/ColumnProfileTable.vue';
import CustomMetricFormDrawer from '@/components/quality/CustomMetricFormDrawer.vue';
import ProfilerTabFilters from '@/components/quality/ProfilerTabFilters.vue';
import TableProfilerChartPreview from '@/components/quality/TableProfilerChartPreview.vue';
import TestCaseFormDrawer from '@/components/quality/TestCaseFormDrawer.vue';
import ProfilerSettingsModal from '@/features/crud/ProfilerSettingsModal.vue';
import IncidentsListView from '@/views/observability/IncidentsListView.vue';
import type { ChartSeries } from '@/features/charts/types';
import type { TableProfile, TestCase } from '@/types/quality';
import { TEST_LEVEL, type TestLevel } from '@/quality/testCaseForm';
import type { IncidentDateRange } from '@/quality/incidentDatePresets';
import { defaultProfilerRange } from '@/quality/tableProfilerChart';

/** Official ProfilerTabPath keys used as sub-tab ids. */
const TABLE_PROFILE = 'table-profile';
const COLUMN_PROFILE = 'column-profile';
const DATA_QUALITY = 'data-quality';
const INCIDENTS = 'incidents';

const props = withDefaults(
  defineProps<{
    entityFqn: string;
    testSuiteFqn?: string;
    testSuiteId?: string;
    deleted?: boolean;
    tests: TestCase[];
    testsError: string;
    testStatusSeries: ChartSeries[];
    tableProfile: TableProfile | null;
    rowCountSeries: ChartSeries[];
    usageSeries: ChartSeries[];
    columnNullSeries: ChartSeries[];
    entityType: string;
    tableId?: string;
    columns?: { name: string; dataType: string; fullyQualifiedName?: string; displayName?: string }[];
    /**
     * Official TableDetailsPageV1 waits for useEntityPermissions, then
     * passes tablePermissions into DataObservabilityTab. Vue Boolean
     * props default to false when omitted, so permissionsLoaded must
     * stay false (unknown) until the table page has resolved them.
     * PermissionPlaceholder is shown only when loaded and ViewDataProfile
     * is false.
     */
    permissionsLoaded?: boolean;
    viewDataProfile?: boolean;
    permissions?: OperationPermissions | null;
  }>(),
  {
    permissionsLoaded: false,
    viewDataProfile: false,
    permissions: null,
    columns: () => [],
  },
);

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();

/** Official profilerClassBase.getDefaultTabKey: TABLE_PROFILE. */
const activeSubTab = ref(TABLE_PROFILE);
const settingsOpen = ref(false);
const testCaseOpen = ref(false);
const initialTestLevel = ref<TestLevel>(TEST_LEVEL.TABLE);
const metricOpen = ref(false);
const metricIsColumn = ref(false);
const editingMetric = ref<CustomMetricRecord | undefined>();
const tableCustomMetrics = ref<CustomMetricRecord[]>([]);
const testCaseCreatePermission = ref(false);
const incidentTabCount = ref(0);

const dataQualityTabLabel = computed(() => t('label.data-entity', { entity: t('label.quality') }));

const activeColumnFqn = computed(() => {
  const value = route.query.activeColumnFqn;
  return typeof value === 'string' ? value : '';
});

const dateRange = computed(() => {
  const fallback = defaultProfilerRange();
  return {
    startTs: route.query.startTs ? Number(route.query.startTs) : fallback.startTs,
    endTs: route.query.endTs ? Number(route.query.endTs) : fallback.endTs,
    key: typeof route.query.key === 'string' ? route.query.key : 'last7days',
    title: typeof route.query.title === 'string' ? route.query.title : undefined,
  };
});

const editDataProfile = computed(
  () =>
    Boolean(props.permissionsLoaded && props.permissions && getDerivedPermissionFlags(props.permissions).can('EditDataProfile')),
);

const createTestCasePermission = computed(
  () => Boolean(props.permissions?.CreateTests || testCaseCreatePermission.value),
);

async function replaceQuery(patch: Record<string, string | number | undefined>): Promise<void> {
  const query: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === 'string' || typeof value === 'number') {
      query[key] = value;
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') {
      delete query[key];
    } else {
      query[key] = value;
    }
  }
  await router.replace({ query });
}

async function onDateChange(range: IncidentDateRange): Promise<void> {
  await replaceQuery({
    startTs: range.startTs,
    endTs: range.endTs,
    key: range.key,
    title: range.title,
  });
}

function onAddTestCase(): void {
  initialTestLevel.value = activeSubTab.value === COLUMN_PROFILE ? TEST_LEVEL.COLUMN : TEST_LEVEL.TABLE;
  testCaseOpen.value = true;
}

function onAddCustomMetric(): void {
  editingMetric.value = undefined;
  metricIsColumn.value = activeSubTab.value === COLUMN_PROFILE;
  metricOpen.value = true;
}

function onEditMetric(metric: CustomMetricRecord): void {
  editingMetric.value = metric;
  metricIsColumn.value = Boolean(metric.columnName) || activeSubTab.value === COLUMN_PROFILE;
  metricOpen.value = true;
}

function closeMetricDrawer(): void {
  metricOpen.value = false;
  editingMetric.value = undefined;
}

async function loadCustomMetrics(): Promise<void> {
  if (!props.tableId) {
    tableCustomMetrics.value = [];
    return;
  }
  try {
    tableCustomMetrics.value = await listTableCustomMetrics(props.tableId);
  } catch {
    tableCustomMetrics.value = [];
  }
}

/**
 * Official DataObservabilityTab.fetchNewIncidentCount: new minus resolved
 * stateId cardinality on testCaseResolutionStatus for this table FQN.
 */
async function loadIncidentTabCount(): Promise<void> {
  const wildcard = `${props.entityFqn}*`;
  const aggregationQuery = 'bucketName=newIncidents:aggType=cardinality:field=stateId';
  const index = 'testCaseResolutionStatus';
  const queryFor = (status: string) =>
    JSON.stringify({
      query: {
        bool: {
          must: [
            { term: { testCaseResolutionStatusType: status } },
            { wildcard: { 'testCase.entityFQN.keyword': wildcard } },
          ],
        },
      },
    });
  try {
    const [newReport, resolvedReport] = await Promise.all([
      getDataQualityReport({ q: queryFor('New'), index, aggregationQuery }),
      getDataQualityReport({ q: queryFor('Resolved'), index, aggregationQuery }),
    ]);
    const newCount = Number(newReport.data[0]?.stateId ?? 0);
    const resolvedCount = Number(resolvedReport.data[0]?.stateId ?? 0);
    incidentTabCount.value = newCount - resolvedCount;
  } catch {
    incidentTabCount.value = 0;
  }
}

async function loadTestCasePermission(): Promise<void> {
  try {
    const ops = await permissionStore.getResourcePermission('testCase');
    testCaseCreatePermission.value = ops.Create === true;
  } catch {
    testCaseCreatePermission.value = false;
  }
}

async function clearActiveColumn(): Promise<void> {
  activeSubTab.value = COLUMN_PROFILE;
  await replaceQuery({ activeColumnFqn: undefined });
}

async function onSelectColumn(fqn: string): Promise<void> {
  await replaceQuery({ activeColumnFqn: fqn });
}

watch(
  () => props.tableId,
  () => {
    void loadCustomMetrics();
  },
);

onMounted(() => {
  void loadCustomMetrics();
  void loadTestCasePermission();
  void loadIncidentTabCount();
});
</script>

<template>
  <div class="asset-data-observability" data-testid="table-profiler-container">
    <div class="asset-data-observability__chrome">
      <a
        v-if="activeColumnFqn"
        href="#"
        class="asset-data-observability__back"
        data-testid="profiler-back-to-column-profile"
        @click.prevent="clearActiveColumn"
      >
        {{ t('label.column-entity', { entity: t('label.profile') }) }}
      </a>
      <Tabs v-else v-model:activeKey="activeSubTab" data-testid="asset-data-observability-tabs">
        <Tabs.TabPane :key="TABLE_PROFILE" :tab="t('label.table-entity-text', { entityText: t('label.profile') })" />
        <Tabs.TabPane :key="COLUMN_PROFILE" :tab="t('label.column-entity', { entity: t('label.profile') })" />
        <Tabs.TabPane :key="DATA_QUALITY" :tab="dataQualityTabLabel" />
        <Tabs.TabPane :key="INCIDENTS">
          <template #tab>
            <span>
              {{ t('label.incident-plural') }}
              <span data-testid="count" class="asset-data-observability__count">{{ incidentTabCount }}</span>
            </span>
          </template>
        </Tabs.TabPane>
      </Tabs>
      <ProfilerTabFilters
        :active-tab="activeSubTab"
        :active-column-fqn="activeColumnFqn"
        :deleted="deleted"
        :edit-data-profile="editDataProfile"
        :create-test-case-permission="createTestCasePermission"
        :start-ts="dateRange.startTs"
        :end-ts="dateRange.endTs"
        :range-key="dateRange.key"
        :range-title="dateRange.title"
        :columns="columns"
        @date-change="onDateChange"
        @add-test-case="onAddTestCase"
        @add-custom-metric="onAddCustomMetric"
        @open-settings="settingsOpen = true"
        @select-column="onSelectColumn"
      />
    </div>

    <div v-show="activeSubTab === TABLE_PROFILE">
      <TableProfilerChartPreview
        show-header
        :entity-fqn="entityFqn"
        :table-id="tableId"
        :table-profile="tableProfile"
        :custom-metrics="tableCustomMetrics"
        :permissions-loaded="permissionsLoaded"
        :view-data-profile="viewDataProfile"
        :permissions="permissions ?? undefined"
        @edit-metric="onEditMetric"
        @metric-deleted="loadCustomMetrics"
      />
    </div>

    <div v-show="activeSubTab === COLUMN_PROFILE">
      <ColumnProfileTable
        :entity-fqn="entityFqn"
        :test-suite-id="testSuiteId"
        :table-profile="tableProfile"
        :table-id="tableId"
        :permissions-loaded="permissionsLoaded"
        :view-data-profile="viewDataProfile"
        :permissions="permissions ?? undefined"
        @open-data-quality="activeSubTab = DATA_QUALITY"
        @edit-metric="onEditMetric"
        @metric-deleted="loadCustomMetrics"
      />
    </div>

    <div v-show="activeSubTab === DATA_QUALITY">
      <AssetDataQualityTab
        :entity-fqn="entityFqn"
        :test-suite-fqn="testSuiteFqn"
        :test-suite-id="testSuiteId"
        :deleted="deleted"
        :table-id="tableId"
        :columns="columns"
        :show-incidents="false"
        :permissions-loaded="permissionsLoaded"
        :view-tests="permissions?.ViewTests === true"
      />
    </div>

    <div v-show="activeSubTab === INCIDENTS">
      <IncidentsListView embedded :origin-entity-fqn="entityFqn" data-testid="asset-dq-incidents" />
    </div>

    <ProfilerSettingsModal
      v-if="tableId"
      :open="settingsOpen"
      :table-id="tableId"
      :columns="columns ?? []"
      @cancel="settingsOpen = false"
      @saved="settingsOpen = false"
    />
    <TestCaseFormDrawer
      :open="testCaseOpen"
      :initial-table-fqn="entityFqn"
      :initial-test-level="initialTestLevel"
      @cancel="testCaseOpen = false"
      @submitted="testCaseOpen = false"
    />
    <CustomMetricFormDrawer
      :open="metricOpen"
      :table-id="tableId"
      :entity-fqn="entityFqn"
      :is-column-metric="metricIsColumn"
      :metric="editingMetric"
      :active-column-fqn="activeColumnFqn"
      :columns="columns"
      :is-profiling-enabled="tableProfile != null"
      @close="closeMetricDrawer"
      @success="loadCustomMetrics(); closeMetricDrawer();"
    />
  </div>
</template>

<style scoped>
.asset-data-observability__chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.asset-data-observability__back {
  color: var(--sm-text-primary);
  font-weight: 600;
}
</style>
