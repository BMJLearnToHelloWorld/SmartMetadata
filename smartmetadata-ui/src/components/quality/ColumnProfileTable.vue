<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ColumnProfileTable: summary cards, search, sortable column
  list with nested expand, test-count links to Data Quality, empty /
  permission / no-profiler states, and SingleColumnProfile when
  activeColumnFqn is set. Vue3 + ant-design-vue. No CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Input, Pagination, Skeleton, Table, Typography } from 'ant-design-vue';
import { DownOutlined, RightOutlined } from '@ant-design/icons-vue';
import { fetchTestCaseResultByTestSuiteId } from '@/api/dataQualityReports';
import { getTableColumnsByFQN, searchTableColumnsByFQN } from '@/api/columns';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import type { OperationPermissions } from '@/api/permissions';
import type { CustomMetricRecord } from '@/api/customMetrics';
import type { TableProfile } from '@/types/quality';
import { aggregateTestResultsByEntity, type TestCaseCountByStatus } from '@/quality/testCaseSummary';
import {
  COLUMN_PROFILE_SEARCH_INTERVAL_MS,
  PAGE_SIZE_LARGE,
  buildOverallSummary,
  entityDisplayName,
  flattenColumnRows,
  formatNumberWithComma,
  formatProportion,
  mapColumnProfileRecord,
  pruneEmptyChildren,
  sortColumnRecords,
  type ColumnProfileRecord,
} from '@/quality/columnProfile';
import NoProfilerBanner from './NoProfilerBanner.vue';
import SingleColumnProfile from './SingleColumnProfile.vue';

/**
 * Official ColumnProfileTable hides the table only when permissions are
 * loaded and ViewDataProfile is false. Vue Boolean props default to false
 * when omitted, so a bare `viewDataProfile?: boolean` would invent a
 * hard hide. `permissionsLoaded` defaults to false (unknown), which
 * matches official `permissions && !permissions.ViewDataProfile`.
 */
const props = withDefaults(
  defineProps<{
    entityFqn: string;
    testSuiteId?: string;
    tableProfile: TableProfile | null;
    tableId?: string;
    permissionsLoaded?: boolean;
    viewDataProfile?: boolean;
    permissions?: OperationPermissions;
  }>(),
  {
    tableId: undefined,
    permissionsLoaded: false,
    viewDataProfile: false,
    permissions: undefined,
  },
);

const emit = defineEmits<{
  (event: 'open-data-quality'): void;
  (event: 'edit-metric', metric: CustomMetricRecord): void;
  (event: 'metric-deleted'): void;
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const data = ref<ColumnProfileRecord[]>([]);
const isColumnsLoading = ref(false);
const searchInput = ref('');
const searchText = ref('');
const currentPage = ref(1);
const pageSize = ref(PAGE_SIZE_LARGE);
const total = ref(0);
const expandedKeys = ref<Set<string>>(new Set());
const sortColumn = ref<string | undefined>();
const sortDirection = ref<'ascend' | 'descend' | undefined>();
const testCaseSummary = ref<Record<string, TestCaseCountByStatus> | undefined>();
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const isProfilingEnabled = computed(() => props.tableProfile != null);
const activeColumnFqn = computed(() => {
  const value = route.query.activeColumnFqn;
  return typeof value === 'string' ? value : '';
});

const overallSummary = computed(() =>
  buildOverallSummary(props.tableProfile, (key, values) => t(key, values), data.value.length),
);

const sortedData = computed(() => sortColumnRecords(data.value, sortColumn.value, sortDirection.value));
const flatRows = computed(() => flattenColumnRows(sortedData.value, expandedKeys.value));

const tableColumns = computed(() => [
  { title: t('label.name'), key: 'name', dataIndex: 'name', sorter: true },
  { title: t('label.data-type'), key: 'dataType', dataIndex: 'dataType', sorter: true },
  { title: `${t('label.null')} %`, key: 'nullProportion', sorter: true },
  { title: `${t('label.unique')} %`, key: 'uniqueProportion', sorter: true },
  { title: `${t('label.distinct')} %`, key: 'distinctProportion', sorter: true },
  { title: t('label.value-count'), key: 'valuesCount', sorter: true },
  { title: t('label.success'), key: 'success' },
  { title: t('label.failed'), key: 'failed' },
  { title: t('label.aborted'), key: 'aborted' },
]);

function testCounts(record: ColumnProfileRecord): TestCaseCountByStatus | undefined {
  return testCaseSummary.value?.[record.fullyQualifiedName?.toLocaleLowerCase() ?? ''];
}

function formatTestCount(count: number | undefined): string {
  return count === undefined || count === 0 ? '--' : String(count);
}

function openDataQuality(): void {
  emit('open-data-quality');
}

async function openColumn(fqn: string): Promise<void> {
  await router.replace({
    query: { ...route.query, activeColumnFqn: fqn },
  });
}

function toggleExpand(key: string): void {
  const next = new Set(expandedKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedKeys.value = next;
}

function onTableChange(_pag: unknown, _filters: unknown, sorter: { columnKey?: string; order?: 'ascend' | 'descend' } | Array<unknown>): void {
  const next = Array.isArray(sorter) ? sorter[0] : sorter;
  const typed = next as { columnKey?: string | number; order?: 'ascend' | 'descend' } | undefined;
  sortColumn.value = typed?.order ? String(typed.columnKey ?? '') : undefined;
  sortDirection.value = typed?.order;
}

function onSearchInput(value: string): void {
  searchInput.value = value;
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchText.value = value;
    currentPage.value = 1;
  }, COLUMN_PROFILE_SEARCH_INTERVAL_MS);
}

async function fetchTableColumnWithProfiler(): Promise<void> {
  if (!props.entityFqn) {
    return;
  }
  isColumnsLoading.value = true;
  try {
    const offset = (currentPage.value - 1) * pageSize.value;
    const params = {
      limit: pageSize.value,
      offset,
      fields: 'profile',
    };
    const response = searchText.value
      ? await searchTableColumnsByFQN(props.entityFqn, { ...params, q: searchText.value })
      : await getTableColumnsByFQN(props.entityFqn, params);
    data.value = pruneEmptyChildren(response.data.flatMap((row) => {
      const mapped = mapColumnProfileRecord(row);
      return mapped ? [mapped] : [];
    }));
    total.value = response.paging.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    isColumnsLoading.value = false;
  }
}

async function fetchTestCaseSummary(): Promise<void> {
  if (!props.testSuiteId) {
    return;
  }
  try {
    const report = await fetchTestCaseResultByTestSuiteId(props.testSuiteId);
    testCaseSummary.value = aggregateTestResultsByEntity(report.data);
  } catch {
    testCaseSummary.value = undefined;
  }
}

watch(
  () => [props.entityFqn, currentPage.value, searchText.value, pageSize.value] as const,
  () => {
    void fetchTableColumnWithProfiler();
  },
  { immediate: true },
);

watch(
  () => props.testSuiteId,
  () => {
    void fetchTestCaseSummary();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});
</script>

<template>
  <div v-if="permissionsLoaded && !viewDataProfile" class="column-profile-table__denied">
    <PermissionPlaceholder permission-value="ViewDataProfile" test-id="permission-error-placeholder" />
  </div>
  <div v-else class="column-profile-table" data-testid="column-profile-table-container">
    <NoProfilerBanner v-if="!isColumnsLoading && !isProfilingEnabled" />
    <div class="column-profile-table__summary">
      <div v-for="summary in overallSummary" :key="summary.key" class="column-profile-table__card" :data-testid="`overall-summary-${summary.key}`">
        <Typography.Text type="secondary">{{ summary.title }}</Typography.Text>
        <div class="column-profile-table__card-value">{{ summary.value }}</div>
        <Typography.Text v-if="summary.extra" type="secondary">{{ summary.extra }}</Typography.Text>
      </div>
    </div>

    <SingleColumnProfile
      v-if="activeColumnFqn"
      :active-column-fqn="activeColumnFqn"
      :columns="data"
      :is-profiling-enabled="isProfilingEnabled"
      :test-case-summary="testCaseSummary"
      :table-id="tableId"
      :permissions="permissions"
      @edit-metric="emit('edit-metric', $event)"
      @metric-deleted="emit('metric-deleted')"
    />

    <div v-else class="column-profile-table__list">
      <div class="column-profile-table__search">
        <Input
          allow-clear
          data-testid="column-profile-search"
          :placeholder="t('message.find-in-table')"
          :value="searchInput"
          @update:value="onSearchInput"
        />
      </div>
      <div v-if="isColumnsLoading" data-testid="column-profile-table-loading-skeletons">
        <Skeleton v-for="index in 5" :key="index" active :title="false" :paragraph="{ rows: 1 }" />
      </div>
      <template v-else>
        <Table
          row-key="id"
          data-testid="column-profile-table"
          :columns="tableColumns"
          :data-source="flatRows"
          :pagination="false"
          size="small"
          @change="onTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <div class="column-profile-table__name" :style="{ paddingLeft: `${record.depth * 12}px` }">
                <button
                  v-if="record.hasChildren"
                  type="button"
                  class="column-profile-table__expand"
                  data-testid="expand-icon"
                  :aria-expanded="expandedKeys.has(record.id)"
                  @click="toggleExpand(record.id)"
                >
                  <DownOutlined v-if="expandedKeys.has(record.id)" />
                  <RightOutlined v-else />
                </button>
                <span v-else class="column-profile-table__expand-spacer" />
                <a href="#" @click.prevent="openColumn(record.record.fullyQualifiedName || record.record.name)">
                  {{ entityDisplayName(record.record) }}
                </a>
              </div>
            </template>
            <template v-else-if="column.key === 'dataType'">
              {{ record.record.dataTypeDisplay || t('label.n-a') }}
            </template>
            <template v-else-if="column.key === 'nullProportion'">
              {{ formatProportion(record.record.profile?.nullProportion) }}
            </template>
            <template v-else-if="column.key === 'uniqueProportion'">
              {{ formatProportion(record.record.profile?.uniqueProportion) }}
            </template>
            <template v-else-if="column.key === 'distinctProportion'">
              {{ formatProportion(record.record.profile?.distinctProportion) }}
            </template>
            <template v-else-if="column.key === 'valuesCount'">
              {{
                record.record.profile?.valuesCount !== undefined && record.record.profile?.valuesCount !== null
                  ? formatNumberWithComma(record.record.profile.valuesCount)
                  : '--'
              }}
            </template>
            <template v-else-if="column.key === 'success'">
              <a
                v-if="formatTestCount(testCounts(record.record)?.success) !== '--'"
                href="#"
                :data-testid="`${record.record.name}-test-success-count`"
                class="column-profile-table__success"
                @click.prevent="openDataQuality"
              >
                {{ testCounts(record.record)?.success }}
              </a>
              <span v-else>--</span>
            </template>
            <template v-else-if="column.key === 'failed'">
              <a
                v-if="formatTestCount(testCounts(record.record)?.failed) !== '--'"
                href="#"
                :data-testid="`${record.record.name}-test-failed-count`"
                class="column-profile-table__failed"
                @click.prevent="openDataQuality"
              >
                {{ testCounts(record.record)?.failed }}
              </a>
              <span v-else>--</span>
            </template>
            <template v-else-if="column.key === 'aborted'">
              <a
                v-if="formatTestCount(testCounts(record.record)?.aborted) !== '--'"
                href="#"
                :data-testid="`${record.record.name}-test-aborted-count`"
                class="column-profile-table__aborted"
                @click.prevent="openDataQuality"
              >
                {{ testCounts(record.record)?.aborted }}
              </a>
              <span v-else>--</span>
            </template>
          </template>
          <template v-if="!flatRows.length" #emptyText>
            <div class="column-profile-table__empty">
              <NoSearchResultsPlaceholder test-id="search-error-placeholder" />
            </div>
          </template>
        </Table>
        <div v-if="total > pageSize" class="column-profile-table__pager">
          <Pagination
            :current="currentPage"
            :page-size="pageSize"
            :total="total"
            show-size-changer
            @change="(page: number, size: number) => { currentPage = page; pageSize = size; }"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.column-profile-table {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.column-profile-table__denied,
.column-profile-table__empty {
  position: relative;
  min-height: 240px;
}
.column-profile-table__summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}
.column-profile-table__card {
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  background: var(--sm-bg-container);
  padding: 16px;
}
.column-profile-table__card-value {
  font-weight: 600;
  color: var(--sm-text-primary);
  margin-top: 4px;
}
.column-profile-table__search {
  margin-left: auto;
  width: 50%;
  margin-bottom: 16px;
}
.column-profile-table__name {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.column-profile-table__expand {
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: var(--sm-text-secondary);
}
.column-profile-table__expand-spacer {
  display: inline-block;
  width: 14px;
}
.column-profile-table__success {
  color: var(--sm-color-success-text);
}
.column-profile-table__failed {
  color: var(--sm-color-error-text);
}
.column-profile-table__aborted {
  color: var(--sm-color-warning-text);
}
.column-profile-table__pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.column-profile-table__list {
  border: 1px solid var(--sm-border-secondary);
  border-radius: 8px;
  padding: 16px;
  background: var(--sm-bg-container);
}
</style>
