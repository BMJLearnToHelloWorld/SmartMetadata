<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official AddTestCaseList (search + aggregate filters + Map selection +
  select-all-total + scroll paging + onChange preview).
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Input, Spin } from 'ant-design-vue';
import {
  type AddTestCaseListChangePayload,
  type AddTestCaseListFilter,
  type AddTestCaseListSubmitPayload,
  listTestCasesBySearch,
} from '@/api/testCases';
import AddTestCaseListFilters from '@/components/quality/AddTestCaseListFilters.vue';
import {
  fetchAddTestCaseColumnOptions,
  fetchAddTestCaseTableOptions,
  type AddTestCaseListFilterOption,
} from '@/quality/addTestCaseListFilterOptions';
import {
  ADD_TEST_CASE_LIST_PAGE_SIZE,
  getColumnNameFromColumnFilterKey,
  getSelectionFlags,
  isNearScrollBottom,
  seedSelectedFromExistingTest,
} from '@/quality/addTestCaseListUtils';
import { entityLabel } from '@/features/crud/paging';
import { TEST_CASE_TYPES } from '@/quality/testCaseForm';
import { TEST_CASE_STATUSES, type TestCase } from '@/types/quality';
import type { EntityRef } from '@/types/api';

const props = defineProps<{
  existingTest?: EntityRef[];
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [payload: AddTestCaseListSubmitPayload];
  change: [payload: AddTestCaseListChangePayload];
}>();

const { t } = useI18n();

const loading = ref(false);
const searchValue = ref('');
const statusFilter = ref<string | undefined>();
const typeFilter = ref<string | undefined>();
const tableFilter = ref<string | undefined>();
const columnFilter = ref<string | undefined>();
const cases = ref<TestCase[]>([]);
const totalCount = ref(0);
const pageNumber = ref(1);
const selectedItems = ref<Map<string, TestCase>>(seedSelectedFromExistingTest(props.existingTest));
const selectAll = ref(false);
const excludedIds = ref<Set<string>>(new Set());

const tableOptions = ref<AddTestCaseListFilterOption[]>([]);
const columnOptions = ref<AddTestCaseListFilterOption[]>([]);
const tableOptionsLoading = ref(false);
const columnOptionsLoading = ref(false);

let tableSearchTimer: ReturnType<typeof setTimeout> | undefined;
let columnSearchTimer: ReturnType<typeof setTimeout> | undefined;
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

const existingIds = computed(() => new Set((props.existingTest ?? []).map((item) => item.id).filter(Boolean)));

const statusOptions = computed(() =>
  TEST_CASE_STATUSES.map((status) => ({ value: status, label: status })),
);

const typeOptions = computed(() =>
  TEST_CASE_TYPES.map((type) => ({ value: type, label: type })),
);

const loadedItemIds = computed(() =>
  cases.value.map((item) => item.id).filter((id): id is string => Boolean(id) && !existingIds.value.has(id)),
);

const isLoadedRowSelected = (id: string): boolean =>
  selectAll.value ? !excludedIds.value.has(id) : selectedItems.value.has(id);

const selectionFlags = computed(() =>
  getSelectionFlags({
    loadedItemIds: loadedItemIds.value,
    isLoadedRowSelected,
    selectAll: selectAll.value,
    totalCount: totalCount.value,
    itemsLength: cases.value.length,
  }),
);

const selectionIndeterminate = computed(() => {
  if (selectAll.value) {
    return excludedIds.value.size > 0;
  }
  const selectedOnPage = loadedItemIds.value.filter((id) => selectedItems.value.has(id)).length;
  return selectedOnPage > 0 && selectedOnPage < loadedItemIds.value.length;
});

const selectionCount = computed(() => {
  if (selectAll.value) {
    return Math.max(0, totalCount.value - existingIds.value.size - excludedIds.value.size);
  }
  return selectedItems.value.size;
});

function activeFilter(): AddTestCaseListFilter {
  const table = tableFilter.value;
  const entityLink = table ? `<#E::table::${table}>` : undefined;
  const columnKey = columnFilter.value;
  const columnName = columnKey ? getColumnNameFromColumnFilterKey(columnKey) : undefined;
  const type = typeFilter.value;
  return {
    q: searchValue.value.trim() || undefined,
    testCaseStatus: statusFilter.value,
    testCaseType: type,
    entityLink,
    includeAllTests: entityLink ? true : undefined,
    columnName: columnName || undefined,
    tableFqn: table,
  };
}

function emitPartialSelection(map: Map<string, TestCase>): void {
  const testCases = [...map.values()];
  emit('change', {
    selectAll: false,
    includeIds: testCases.map((c) => c.id ?? '').filter(Boolean),
    excludeIds: [],
    testCases,
  });
}

function emitFullSelection(excluded: Set<string>): void {
  emit('change', {
    selectAll: true,
    includeIds: [],
    excludeIds: [...excluded],
    testCases: [],
    filter: activeFilter(),
  });
}

function resetGlobalSelection(): void {
  if (!selectAll.value) {
    return;
  }
  selectAll.value = false;
  excludedIds.value = new Set();
  emitPartialSelection(selectedItems.value);
}

async function loadCases(append = false): Promise<void> {
  if (loading.value) {
    return;
  }
  loading.value = true;
  try {
    const nextPage = append ? pageNumber.value + 1 : 1;
    if (!append) {
      cases.value = [];
    }
    const offset = (nextPage - 1) * ADD_TEST_CASE_LIST_PAGE_SIZE;
    const page = await listTestCasesBySearch({
      ...activeFilter(),
      limit: ADD_TEST_CASE_LIST_PAGE_SIZE,
      offset,
    });
    const rows = page.data;
    const fresh = rows.filter((item) => item.id && !existingIds.value.has(item.id));
    if (append) {
      const seen = new Set(cases.value.map((row) => row.id));
      cases.value = [...cases.value, ...fresh.filter((row) => row.id && !seen.has(row.id))];
      pageNumber.value = nextPage;
    } else {
      cases.value = fresh;
      pageNumber.value = 1;
    }
    totalCount.value = page.paging?.total ?? cases.value.length;
  } finally {
    loading.value = false;
  }
}

async function loadNextPage(): Promise<void> {
  if (loading.value || cases.value.length >= totalCount.value) {
    return;
  }
  await loadCases(true);
}

function onRowsScroll(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (isNearScrollBottom(target) && cases.value.length < totalCount.value) {
    void loadNextPage();
  }
}

function handlePageSelectAllCheckbox(checked: boolean): void {
  if (cases.value.length === 0) {
    return;
  }
  if (checked) {
    if (selectAll.value) {
      const next = new Set(excludedIds.value);
      loadedItemIds.value.forEach((id) => next.delete(id));
      excludedIds.value = next;
      emitFullSelection(next);
    } else {
      const next = new Map(selectedItems.value);
      cases.value.forEach((item) => {
        if (item.id) {
          next.set(item.id, item);
        }
      });
      selectedItems.value = next;
      emitPartialSelection(next);
    }
  } else if (selectAll.value) {
    selectedItems.value = new Map();
    selectAll.value = false;
    excludedIds.value = new Set();
    emitPartialSelection(new Map());
  } else {
    const next = new Map(selectedItems.value);
    loadedItemIds.value.forEach((id) => next.delete(id));
    selectedItems.value = next;
    emitPartialSelection(next);
  }
}

function handleSelectAllMatchingTotal(): void {
  selectAll.value = true;
  excludedIds.value = new Set();
  selectedItems.value = new Map();
  emitFullSelection(new Set());
}

function toggleRow(testCase: TestCase): void {
  const id = testCase.id;
  if (!id) {
    return;
  }
  if (selectAll.value) {
    const nextExcluded = new Set(excludedIds.value);
    if (nextExcluded.has(id)) {
      nextExcluded.delete(id);
    } else {
      nextExcluded.add(id);
    }
    excludedIds.value = nextExcluded;
    emitFullSelection(nextExcluded);
    return;
  }
  const next = new Map(selectedItems.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.set(id, testCase);
  }
  selectedItems.value = next;
  emitPartialSelection(next);
}

function onSubmit(): void {
  if (selectAll.value) {
    emit('submit', {
      selectAll: true,
      includeIds: [],
      excludeIds: [...excludedIds.value],
      filter: activeFilter(),
    });
    return;
  }
  const testCases = [...selectedItems.value.values()];
  emit('submit', {
    selectAll: false,
    includeIds: testCases.map((c) => c.id ?? '').filter(Boolean),
    excludeIds: [],
  });
}

async function refreshTableOptions(search = '*'): Promise<void> {
  tableOptionsLoading.value = true;
  try {
    tableOptions.value = await fetchAddTestCaseTableOptions(search);
  } finally {
    tableOptionsLoading.value = false;
  }
}

async function refreshColumnOptions(search = ''): Promise<void> {
  columnOptionsLoading.value = true;
  try {
    columnOptions.value = await fetchAddTestCaseColumnOptions(search, tableFilter.value);
  } finally {
    columnOptionsLoading.value = false;
  }
}

function onTableSearch(search: string): void {
  if (tableSearchTimer) {
    clearTimeout(tableSearchTimer);
  }
  tableSearchTimer = setTimeout(() => {
    void refreshTableOptions(search.trim() === '' ? '*' : search);
  }, 1000);
}

function onColumnSearch(search: string): void {
  if (columnSearchTimer) {
    clearTimeout(columnSearchTimer);
  }
  columnSearchTimer = setTimeout(() => {
    void refreshColumnOptions(search);
  }, 1000);
}

function onFilterChange(): void {
  resetGlobalSelection();
  void loadCases();
}

watch(
  () => props.existingTest,
  (refs) => {
    const next = new Map(selectedItems.value);
    let changed = false;
    (refs ?? []).forEach((ref) => {
      if (ref.id && !next.has(ref.id)) {
        next.set(ref.id, { id: ref.id, name: ref.name ?? '' } as TestCase);
        changed = true;
      }
    });
    if (changed) {
      selectedItems.value = next;
    }
  },
  { deep: true },
);

watch(searchValue, () => {
  resetGlobalSelection();
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = setTimeout(() => {
    void loadCases();
  }, 400);
});

watch([statusFilter, typeFilter, tableFilter, columnFilter], () => {
  onFilterChange();
});

watch(tableFilter, () => {
  columnFilter.value = undefined;
  void refreshColumnOptions('');
});

onMounted(() => {
  void Promise.all([loadCases(), refreshTableOptions(), refreshColumnOptions()]);
  emitPartialSelection(selectedItems.value);
});

onUnmounted(() => {
  if (tableSearchTimer) {
    clearTimeout(tableSearchTimer);
  }
  if (columnSearchTimer) {
    clearTimeout(columnSearchTimer);
  }
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
});
</script>

<template>
  <div class="add-test-case-list" data-testid="add-test-case-list">
    <Input
      v-model:value="searchValue"
      :placeholder="t('label.search-entity', { entity: t('label.test-case-lowercase') })"
      data-testid="add-test-case-search"
      allow-clear
    />
    <AddTestCaseListFilters
      :status-options="statusOptions"
      :type-options="typeOptions"
      :table-options="tableOptions"
      :column-options="columnOptions"
      :status-value="statusFilter"
      :type-value="typeFilter"
      :table-value="tableFilter"
      :column-value="columnFilter"
      :table-loading="tableOptionsLoading"
      :column-loading="columnOptionsLoading"
      @status-change="(v) => (statusFilter = v)"
      @type-change="(v) => (typeFilter = v)"
      @table-change="(v) => (tableFilter = v)"
      @column-change="(v) => (columnFilter = v)"
      @table-search="onTableSearch"
      @column-search="onColumnSearch"
    />
    <div class="add-test-case-list__toolbar">
      <Checkbox
        :checked="
          selectAll
            ? selectionFlags.allLoadedSelected && !selectionIndeterminate
            : selectionFlags.allLoadedSelected
        "
        :indeterminate="selectionIndeterminate"
        data-testid="add-test-case-select-all"
        @change="handlePageSelectAllCheckbox(($event.target as HTMLInputElement).checked)"
      >
        {{ t('label.select-all-entity', { entity: t('label.test-case-plural') }) }}
      </Checkbox>
      <button
        v-if="selectionFlags.showSelectAllTotalLink"
        type="button"
        class="add-test-case-list__select-total"
        data-testid="select-all-total-test-cases"
        @click="handleSelectAllMatchingTotal"
      >
        {{ t('label.select-all-count-test-cases', { count: totalCount }) }}
      </button>
      <span class="add-test-case-list__count" data-testid="add-test-case-selection-count">
        {{ t('label.n-selected', { count: selectionCount }) }}
      </span>
    </div>
    <Spin :spinning="loading">
      <div
        class="add-test-case-list__rows"
        data-testid="add-test-case-rows"
        @scroll.passive="onRowsScroll"
      >
        <label
          v-for="item in cases"
          :key="item.id"
          class="add-test-case-list__row"
        >
          <Checkbox
            :checked="item.id ? isLoadedRowSelected(item.id) : false"
            :data-testid="`add-test-case-row-${item.id}`"
            @change="toggleRow(item)"
          />
          <span>
            <strong>{{ entityLabel(item) }}</strong>
            <div class="add-test-case-list__meta">
              {{ item.testDefinition?.displayName || item.testDefinition?.name }} ·
              {{ item.entityFQN || item.entityLink }}
            </div>
          </span>
        </label>
      </div>
    </Spin>
    <div class="add-test-case-list__actions">
      <Button data-testid="add-test-case-cancel" @click="emit('cancel')">{{ t('label.cancel') }}</Button>
      <Button
        type="primary"
        data-testid="add-test-case-submit"
        :disabled="selectionCount === 0"
        @click="onSubmit"
      >
        {{ t('label.add') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.add-test-case-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.add-test-case-list__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.add-test-case-list__select-total {
  background: none;
  border: none;
  color: var(--sm-color-primary);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  text-decoration: underline;
}
.add-test-case-list__count {
  margin-left: auto;
  color: var(--sm-text-secondary);
  font-size: 12px;
}
.add-test-case-list__rows {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--sm-border-color);
  border-radius: 6px;
  padding: 8px;
}
.add-test-case-list__row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 4px;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: 0 52px;
}
.add-test-case-list__meta {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.add-test-case-list__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>