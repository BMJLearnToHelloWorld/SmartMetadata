<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Dropdown, Input, Menu, Select, Switch, message } from 'ant-design-vue';
import { deleteTestCase, exportTestCasesInCSV, listTestCases, listTestCasesBySearch } from '@/api/testCases';
import { notifyCsvJobsRefresh } from '@/api/csvJobs';
import { ApiError } from '@/api/client';
import { formatChartTs } from '@/features/charts/series';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import TestCaseFormDrawer from '@/components/quality/TestCaseFormDrawer.vue';
import TestCaseDeleteModal from '@/components/quality/TestCaseDeleteModal.vue';
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
const searchValue = ref('');
const typeFilter = ref<string | undefined>();
const tableFilter = ref(props.entityFqn ?? '');
const tagFilter = ref(props.tags ?? '');
const showDeleted = ref(false);
const showAdvanced = ref(false);
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
    if (props.preferSearch) {
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
          dataProductFqn: props.dataProductFqn,
          dataQualityDimension: props.dataQualityDimension,
          entityFQN: tableFilter.value.trim() || props.entityFqn,
          include: includeMode(),
          startTimestamp: props.startTs,
          endTimestamp: props.endTs,
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
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
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
    await exportTestCasesInCSV('*', { recursive: true });
    notifyCsvJobsRefresh();
    message.success(t('quality.testCases.exportStarted'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
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

onMounted(() => {
  void load();
});

defineExpose({ openCreate });
</script>

<template>
  <div>
    <div v-if="embedded && (results || health || coverage)" class="tc-insights" data-testid="test-cases-insights">
      <div class="tc-insights__card" data-testid="test-cases-insight-all">
        <div>{{ t('quality.testCases.allTests') }}</div>
        <strong>{{ results?.total ?? visibleCases.length }}</strong>
      </div>
      <div class="tc-insights__card" data-testid="test-cases-insight-health">
        <div>{{ t('quality.landing.healthyAssets') }}</div>
        <strong>{{ health?.healthy ?? 0 }}</strong>
      </div>
      <div class="tc-insights__card" data-testid="test-cases-insight-coverage">
        <div>{{ t('quality.landing.coverage') }}</div>
        <strong>{{ coverage?.covered ?? 0 }}</strong>
      </div>
    </div>
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
      <Button type="primary" data-testid="create-test-case" @click="openCreate">
        {{ t('quality.testCases.create') }}
      </Button>
      <Dropdown :trigger="['click']">
        <Button data-testid="test-cases-manage">⋯</Button>
        <template #overlay>
          <Menu @click="onManageMenu">
            <Menu.Item key="import" data-testid="test-cases-import">{{ t('quality.testCases.import') }}</Menu.Item>
            <Menu.Item key="export" data-testid="test-cases-export">{{ t('quality.testCases.export') }}</Menu.Item>
            <Menu.Item key="bulk" data-testid="test-cases-bulk-edit">{{ t('quality.testCases.bulkEdit') }}</Menu.Item>
          </Menu>
        </template>
      </Dropdown>
    </template>
    <template #filters>
      <Button data-testid="test-cases-advanced" @click="showAdvanced = !showAdvanced">{{ t('quality.testCases.advanced') }}</Button>
      <Input
        v-model:value="tableFilter"
        allow-clear
        :placeholder="t('quality.testCases.tableFilter')"
        data-testid="test-cases-table-filter"
        style="width: 200px"
        @change="onFilterChange"
      />
      <Select
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
      <Input
        v-model:value="tagFilter"
        :placeholder="t('quality.testCases.tagFilter')"
        data-testid="test-cases-tag-filter"
        style="width: 160px"
        @change="onFilterChange"
      />
      <span v-if="showAdvanced" data-testid="test-cases-advanced-filters">
        <Switch v-model:checked="showDeleted" data-testid="test-cases-show-deleted" @change="onFilterChange" />
        {{ t('quality.testCases.showDeleted') }}
      </span>
      <span v-else class="tc-deleted-toggle">
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
.tc-insights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.tc-insights__card {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
}
.tc-deleted-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
