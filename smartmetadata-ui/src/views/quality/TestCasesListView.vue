<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Dropdown, Menu, Select, Switch, message } from 'ant-design-vue';
import { deleteTestCase, exportTestCasesInCSV, listTestCases, listTestCasesBySearch } from '@/api/testCases';
import { markCsvJobOwned, notifyCsvJobsRefresh } from '@/api/csvJobs';
import { downloadCsv } from '@/features/csv/csv';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { ApiError } from '@/api/client';
import { formatChartTs } from '@/features/charts/series';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import TestCaseFormDrawer from '@/components/quality/TestCaseFormDrawer.vue';
import TestCaseDeleteModal from '@/components/quality/TestCaseDeleteModal.vue';
import IncidentDateRangeFilter from '@/components/quality/IncidentDateRangeFilter.vue';
import TestCaseInsightDonuts from '@/components/quality/TestCaseInsightDonuts.vue';
import TestCaseFilterAsyncSelect from '@/components/quality/TestCaseFilterAsyncSelect.vue';
import {
  fetchDataProductFilterOptions,
  fetchDimensionFilterOptions,
  fetchServiceFilterOptions,
  fetchTableFilterOptions,
  fetchTagFilterOptions,
  fetchTierFilterOptions,
} from '@/quality/testCaseFilterOptions';
import type { IncidentDateRange } from '@/quality/incidentDatePresets';
import {
  DEFAULT_VISIBLE_TEST_CASE_FILTERS,
  TEST_CASE_ADVANCED_FILTER_MENU,
  TEST_CASE_FILTER_I18N,
  TEST_CASE_FILTER_KEYS,
  TEST_CASE_PLATFORMS,
  type TestCaseFilterKey,
  isTestCaseFilterVisible,
  requiresSearchPath,
  toggleTestCaseFilter,
} from '@/quality/testCaseFilters';
import { columnFromEntity, tableFqnFromEntity, TEST_CASE_TYPES } from '@/quality/testCaseForm';
import type { CoverageCounts, HealthCounts, StatusCounts } from '@/quality/landing';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import { filterCasesForSearch } from '@/quality/landing';
import { TEST_CASE_STATUSES, type TestCase } from '@/types/quality';

const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    preferSearch?: boolean;
    ownerFqn?: string;
    tier?: string;
    tags?: string;
    dataProductFqn?: string;
    startTs?: number;
    endTs?: number;
    /** Dashboard drill-down (pin getTestCaseListPath testCaseStatus): seeds the status filter. A health-segment drill carries two statuses. */
    status?: string | string[];
    /** Dashboard drill-down (pin getTestCaseListPath dataQualityDimension): search-path filter. */
    dataQualityDimension?: string;
    /** Dashboard drill-down (pin getTestCaseListPath tableFqn): search-path entity scope. */
    entityFqn?: string;
    coverage?: CoverageCounts | null;
    health?: HealthCounts | null;
    results?: StatusCounts | null;
  }>(),
  {
    embedded: false,
    preferSearch: false,
  },
);

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const cases = ref<TestCase[]>([]);
const total = ref<number | undefined>();
const emit = defineEmits<{ 'update:total': [total: number] }>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const offset = ref(0);
const usingSearch = ref(false);
const statusFilter = ref<string | string[] | undefined>(props.status);

/**
 * The single-select shows a value only when exactly one status is
 * active. A health-drill seed carries two statuses (Success+Queued /
 * Failed+Aborted, pin BINARY_STATUS_PIE_SEGMENT_ORDER) — the list fetch
 * honors both while the select shows the placeholder until the viewer
 * picks one (pin's ClassicTestCaseFilter is single-select per key too).
 */
const statusSelectValue = computed(() =>
  typeof statusFilter.value === 'string' ? statusFilter.value : undefined,
);

function onStatusFilterChange(value: unknown): void {
  statusFilter.value = typeof value === 'string' && value ? value : undefined;
  onFilterChange();
}

function isFilterVisible(key: TestCaseFilterKey): boolean {
  return isTestCaseFilterVisible(visibleFilters.value, key);
}

function onAdvancedMenu({ key }: { key: string | number }): void {
  visibleFilters.value = toggleTestCaseFilter(visibleFilters.value, String(key) as TestCaseFilterKey);
}

function onLastRunApply(range: IncidentDateRange): void {
  lastRunStartTs.value = range.startTs;
  lastRunEndTs.value = range.endTs;
  lastRunKey.value = range.key;
  lastRunTitle.value = range.title;
  onFilterChange();
}

function onLastRunClear(): void {
  lastRunStartTs.value = undefined;
  lastRunEndTs.value = undefined;
  lastRunKey.value = undefined;
  lastRunTitle.value = undefined;
  onFilterChange();
}

const startTimestamp = computed(() => lastRunStartTs.value ?? props.startTs);
const endTimestamp = computed(() => lastRunEndTs.value ?? props.endTs);
const searchValue = ref('');
const typeFilter = ref<string | undefined>();
const tableFilter = ref(props.entityFqn ?? '');
const tagFilter = ref(props.tags ?? '');
const showDeleted = ref(false);
const visibleFilters = ref<TestCaseFilterKey[]>([...DEFAULT_VISIBLE_TEST_CASE_FILTERS]);
const platformFilter = ref<string[]>([]);
const lastRunStartTs = ref<number | undefined>();
const lastRunEndTs = ref<number | undefined>();
const lastRunKey = ref<string | undefined>();
const lastRunTitle = ref<string | undefined>();
const tierFilter = ref(props.tier ?? '');
const serviceFilter = ref('');
const dimensionFilter = ref(props.dataQualityDimension ?? '');
const dataProductFilter = ref(props.dataProductFqn ?? '');
const formOpen = ref(false);
const editing = ref<TestCase | undefined>();
const deleting = ref<TestCase | undefined>();
const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.status'), key: 'status', width: 110 },
  { title: t('quality.testCases.failureReason'), key: 'failureReason', ellipsis: true },
  {
    title: t('quality.testCases.lastRun'),
    key: 'lastRun',
    width: 170,
    sorter: (left, right) =>
      ((left as TestCase).testCaseResult?.timestamp ?? 0) - ((right as TestCase).testCaseResult?.timestamp ?? 0),
  },
  {
    title: t('crud.name'),
    dataIndex: 'name',
    key: 'name',
    sorter: (left, right) => entityLabel(left as TestCase).localeCompare(entityLabel(right as TestCase)),
  },
  { title: t('quality.testCases.asset'), key: 'entityFQN' },
  { title: t('quality.testCases.column'), key: 'column', width: 140 },
  { title: t('quality.testCases.incident'), key: 'incident', width: 120 },
]);

function includeMode(): 'non-deleted' | 'deleted' {
  return showDeleted.value ? 'deleted' : 'non-deleted';
}

function incidentLabel(record: TestCase): string {
  return record.incidentStatus || (record.incidentId ? 'New' : '');
}

const visibleCases = computed(() =>
  usingSearch.value ? cases.value : filterCasesForSearch(cases.value, searchValue.value),
);

const hasNext = computed(() =>
  usingSearch.value
    ? offset.value + cases.value.length < (total.value ?? 0) ||
      (total.value === undefined && cases.value.length === DEFAULT_PAGE_SIZE)
    : canGoNext(pageAfter.value),
);
const hasPrev = computed(() => (usingSearch.value ? offset.value > 0 : canGoPrev(cursor.value)));

function resetPager(): void {
  cursor.value = createCursorPager();
  offset.value = 0;
  pageAfter.value = undefined;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const useSearch =
      props.preferSearch ||
      requiresSearchPath({
        testPlatforms: platformFilter.value,
        lastRunStartTs: lastRunStartTs.value,
        lastRunEndTs: lastRunEndTs.value,
        tier: tierFilter.value,
        serviceName: serviceFilter.value,
        dataQualityDimension: dimensionFilter.value,
        dataProductFqn: dataProductFilter.value,
      });
    if (useSearch) {
      try {
        const page = await listTestCasesBySearch({
          q: searchValue.value.trim() || undefined,
          limit: DEFAULT_PAGE_SIZE,
          offset: offset.value,
          includeAllTests: true,
          testCaseStatus: statusFilter.value,
          testCaseType: typeFilter.value,
          owner: props.ownerFqn,
          tier: props.tier,
          tags: tagFilter.value || props.tags,
          dataProductFqn: dataProductFilter.value || props.dataProductFqn,
          dataQualityDimension: dimensionFilter.value || props.dataQualityDimension,
          entityFQN: tableFilter.value.trim() || props.entityFqn,
          include: includeMode(),
          startTimestamp: startTimestamp.value,
          endTimestamp: endTimestamp.value,
          testPlatforms: platformFilter.value.length ? platformFilter.value : undefined,
          tier: tierFilter.value || props.tier,
          serviceName: serviceFilter.value || undefined,
          sortField: 'testCaseResult.timestamp',
          sortType: 'desc',
        });
        cases.value = page.data;
        total.value = page.total;
        usingSearch.value = true;
        return;
      } catch (error) {
        if (!(error instanceof ApiError && error.status >= 400 && error.status < 500)) {
          throw error;
        }
      }
    }
    usingSearch.value = false;
    const page = await listTestCases({
      limit: DEFAULT_PAGE_SIZE,
      after: cursor.value.after,
      includeAllTests: true,
      testCaseStatus: statusFilter.value,
      testCaseType: typeFilter.value,
      include: includeMode(),
      // No dimension parameter on the plain list endpoint: a dimension
      // drill-down only narrows the search path above.
      entityFQN: tableFilter.value.trim() || props.entityFqn,
    });
    cases.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    cases.value = [];
    errorMessage.value = getErrorText(error, t('server.unexpected-error'));
  } finally {
    loading.value = false;
  }
}

function onNext(): void {
  if (usingSearch.value) {
    offset.value += DEFAULT_PAGE_SIZE;
  } else if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  void load();
}

function onPrev(): void {
  if (usingSearch.value) {
    offset.value = Math.max(0, offset.value - DEFAULT_PAGE_SIZE);
  } else {
    cursor.value = goPrev(cursor.value);
  }
  void load();
}

function onFilterChange(): void {
  resetPager();
  void load();
}

function onSearch(): void {
  if (usingSearch.value || props.preferSearch) {
    resetPager();
    void load();
  }
}

function openCreate(): void {
  editing.value = undefined;
  formOpen.value = true;
}

function openEdit(record: TestCase): void {
  editing.value = record;
  formOpen.value = true;
}

async function onFormSubmitted(saved: TestCase): Promise<void> {
  const wasEdit = Boolean(editing.value);
  formOpen.value = false;
  editing.value = undefined;
  message.success(t(wasEdit ? 'quality.testCases.updated' : 'quality.testCases.created', { name: saved.name }));
  resetPager();
  await load();
}

function onManageMenu({ key }: { key: string | number }): void {
  if (key === 'import') {
    void router.push({ path: '/bulk/import/testCase/*' });
  } else if (key === 'export') {
    void exportCases();
  } else if (key === 'bulk') {
    void router.push({ path: '/bulk/edit/testCase/*' });
  }
}

async function exportCases(): Promise<void> {
  try {
    const result = await exportTestCasesInCSV('*', { recursive: true });
    if (typeof result === 'string') {
      downloadCsv(result, `*_${new Date().toISOString().slice(0, 10)}.csv`);
      return;
    }
    const jobId = result && typeof result === 'object' && 'jobId' in result
      ? (result as { jobId?: unknown }).jobId
      : undefined;
    markCsvJobOwned(typeof jobId === 'string' ? jobId : undefined);
    notifyCsvJobsRefresh();
  } catch (error) {
    message.error(getErrorText(error, t('server.unexpected-error')));
  }
}

watch(
  () =>
    [
      props.preferSearch,
      props.ownerFqn,
      props.tier,
      props.tags,
      props.dataProductFqn,
      props.startTs,
      props.endTs,
    ].join('|'),
  () => {
    resetPager();
    void load();
  },
);

// Dashboard drill-down props (status / dimension / entity) arrive after
// mount when the landing view forwards a new route query: seed the
// status filter from the prop and reload on any of them changing.
watch(
  () => [props.status, props.dataQualityDimension, props.entityFqn].join('|'),
  () => {
    statusFilter.value = props.status;
    resetPager();
    void load();
  },
);

function openDelete(record: TestCase): void {
  deleting.value = record;
}

async function onDeleteConfirm(mode: 'soft' | 'hard'): Promise<void> {
  const record = deleting.value;
  if (!record) {
    return;
  }
  try {
    await deleteTestCase(record.id, { hardDelete: mode === 'hard', recursive: mode === 'hard' });
    deleting.value = undefined;
    message.success(t('crud.deletedName', { name: record.displayName || record.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

watch(total, (value) => {
  emit('update:total', value ?? 0);
}, { immediate: true });

onMounted(() => {
  void load();
});

defineExpose({ openCreate, total });
</script>

<template>
  <div>
    <TestCaseInsightDonuts
      v-if="embedded && (results || health || coverage)"
      :results="results"
      :health="health"
      :coverage="coverage"
    />
  <EntityListShell
    :title="t('quality.testCases.title')"
    :lead="t('quality.testCases.lead')"
    :hide-heading="embedded"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="visibleCases"
    table-test-id="test-cases-table"
    show-search
    :search-value="searchValue"
    :search-placeholder="t('quality.testCases.searchPlaceholder')"
    show-row-actions
    show-edit-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    :empty-text="t('quality.testCases.empty')"
    @update:search-value="searchValue = $event"
    @search="onSearch"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'quality-test-case', params: { id: (record as TestCase).id } })"
    @edit="(record) => openEdit(record as TestCase)"
    @delete="(record) => openDelete(record as TestCase)"
  >
    <template #actions>
      <Button v-if="!embedded" type="primary" data-testid="create-test-case" @click="openCreate">
        {{ t('quality.testCases.create') }}
      </Button>
      <Dropdown v-if="!embedded" :trigger="['click']">
        <Button data-testid="test-cases-manage">⋯</Button>
        <template #overlay>
          <Menu @click="onManageMenu">
            <Menu.Item key="import" data-testid="test-cases-import">{{ t('label.import') }}</Menu.Item>
            <Menu.Item key="export" data-testid="test-cases-export">{{ t('label.export') }}</Menu.Item>
            <Menu.Item key="bulk" data-testid="test-cases-bulk-edit">{{ t('label.bulk-edit') }}</Menu.Item>
          </Menu>
        </template>
      </Dropdown>
    </template>
    <template #filters>
      <Dropdown :trigger="['click']">
        <Button data-testid="test-cases-advanced">{{ t('quality.testCases.advanced') }}</Button>
        <template #overlay>
          <Menu data-testid="test-cases-advanced-menu" @click="onAdvancedMenu">
            <Menu.Item
              v-for="key in TEST_CASE_ADVANCED_FILTER_MENU"
              :key="key"
              :data-testid="`test-cases-advanced-${key}`"
            >
              <span v-if="isFilterVisible(key)">✓ </span>{{ t(TEST_CASE_FILTER_I18N[key]) }}
            </Menu.Item>
          </Menu>
        </template>
      </Dropdown>
      <IncidentDateRangeFilter
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.lastRun)"
        :start-ts="lastRunStartTs"
        :end-ts="lastRunEndTs"
        :range-key="lastRunKey"
        :range-title="lastRunTitle"
        test-id="test-cases-last-run-filter"
        @apply="onLastRunApply"
        @clear="onLastRunClear"
      />
      <TestCaseFilterAsyncSelect
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.table)"
        v-model="tableFilter"
        :placeholder="t('quality.testCases.tableFilter')"
        test-id="test-cases-table-filter"
        :fetch-options="fetchTableFilterOptions"
        @change="onFilterChange"
      />
      <Select
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.platform)"
        v-model:value="platformFilter"
        mode="multiple"
        allow-clear
        :placeholder="t('quality.testCases.platformFilter')"
        data-testid="test-cases-platform-filter"
        style="width: 180px"
        @change="onFilterChange"
      >
        <Select.Option v-for="platform in TEST_CASE_PLATFORMS" :key="platform" :value="platform">
          {{ platform }}
        </Select.Option>
      </Select>
      <Select
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.type)"
        v-model:value="typeFilter"
        allow-clear
        :placeholder="t('quality.testCases.typeFilter')"
        data-testid="test-cases-type-filter"
        style="width: 140px"
        @change="onFilterChange"
      >
        <Select.Option v-for="type in TEST_CASE_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
      </Select>
      <Select
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.status)"
        :value="statusSelectValue"
        allow-clear
        :placeholder="t('quality.testCases.statusFilter')"
        data-testid="test-cases-status-filter"
        style="width: 160px"
        @change="onStatusFilterChange"
      >
        <Select.Option v-for="status in TEST_CASE_STATUSES" :key="status" :value="status">
          {{ status }}
        </Select.Option>
      </Select>
      <TestCaseFilterAsyncSelect
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.tags)"
        v-model="tagFilter"
        :placeholder="t('quality.testCases.tagFilter')"
        test-id="test-cases-tag-filter"
        width="160px"
        :fetch-options="fetchTagFilterOptions"
        @change="onFilterChange"
      />
      <TestCaseFilterAsyncSelect
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.tier)"
        v-model="tierFilter"
        :placeholder="t('quality.testCases.tierFilter')"
        test-id="test-cases-tier-filter"
        width="140px"
        :remote="false"
        :fetch-options="fetchTierFilterOptions"
        @change="onFilterChange"
      />
      <TestCaseFilterAsyncSelect
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.service)"
        v-model="serviceFilter"
        :placeholder="t('quality.testCases.serviceFilter')"
        test-id="test-cases-service-filter"
        width="160px"
        :fetch-options="fetchServiceFilterOptions"
        @change="onFilterChange"
      />
      <TestCaseFilterAsyncSelect
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.dimension)"
        v-model="dimensionFilter"
        :placeholder="t('quality.testCases.dimensionFilter')"
        test-id="test-cases-dimension-filter"
        width="160px"
        :remote="false"
        :fetch-options="() => fetchDimensionFilterOptions(t('label.no-dimension'))"
        @change="onFilterChange"
      />
      <TestCaseFilterAsyncSelect
        v-if="isFilterVisible(TEST_CASE_FILTER_KEYS.dataProduct)"
        v-model="dataProductFilter"
        :placeholder="t('quality.testCases.dataProductFilter')"
        test-id="test-cases-data-product-filter"
        width="180px"
        :fetch-options="fetchDataProductFilterOptions"
        @change="onFilterChange"
      />
      <span class="tc-deleted-toggle">
        <Switch v-model:checked="showDeleted" data-testid="test-cases-show-deleted" @change="onFilterChange" />
        {{ t('quality.testCases.showDeleted') }}
      </span>
    </template>
    <template #emptyExtra>
      <Button type="primary" data-testid="test-cases-empty-cta" @click="openCreate">
        {{ t('quality.testCases.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`test-case-row-${(record as TestCase).id}`"
          @click.prevent="router.push({ name: 'quality-test-case', params: { id: (record as TestCase).id } })"
        >
          {{ entityLabel(record as TestCase) }}
        </a>
      </template>
      <template v-else-if="column.key === 'entityFQN'">
        {{ tableFqnFromEntity(record as TestCase) || (record as TestCase).entityFQN || '—' }}
      </template>
      <template v-else-if="column.key === 'column'">
        {{ columnFromEntity(record as TestCase) || '—' }}
      </template>
      <template v-else-if="column.key === 'failureReason'">
        {{ (record as TestCase).testCaseResult?.result || '—' }}
      </template>
      <template v-else-if="column.key === 'incident'">
        <span v-if="incidentLabel(record as TestCase)" :data-testid="`test-case-incident-${(record as TestCase).id}`">
          {{ incidentLabel(record as TestCase) }}
        </span>
        <span v-else>—</span>
      </template>
      <template v-else-if="column.key === 'status'">
        {{
          (record as TestCase).testCaseResult?.testCaseStatus || (record as TestCase).testCaseStatus || '—'
        }}
      </template>
      <template v-else-if="column.key === 'lastRun'">
        {{ formatChartTs((record as TestCase).testCaseResult?.timestamp) || '—' }}
      </template>
    </template>
  </EntityListShell>
  <TestCaseFormDrawer
    :open="formOpen"
    :test-case="editing"
    @cancel="formOpen = false; editing = undefined"
    @submitted="onFormSubmitted"
  />
  <TestCaseDeleteModal
    :open="Boolean(deleting)"
    :name="deleting?.displayName || deleting?.name || ''"
    @cancel="deleting = undefined"
    @confirm="onDeleteConfirm"
  />
  </div>
</template>

<style scoped>
.tc-deleted-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
