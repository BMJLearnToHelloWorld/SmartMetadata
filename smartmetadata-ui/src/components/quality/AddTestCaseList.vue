<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official AddTestCaseList (search + filters + select-all + bulk add).
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Input, Select, Space, Spin } from 'ant-design-vue';
import {
  type AddTestCaseListFilter,
  type AddTestCaseListSubmitPayload,
  listTestCasesBySearch,
} from '@/api/testCases';
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
}>();

const { t } = useI18n();

const loading = ref(false);
const searchValue = ref('');
const statusFilter = ref<string | undefined>();
const typeFilter = ref<string | undefined>();
const tableFilter = ref('');
const columnFilter = ref('');
const cases = ref<TestCase[]>([]);
const totalCount = ref(0);
const selectedIds = ref<Set<string>>(new Set());
const selectAll = ref(false);
const offset = ref(0);
const pageSize = 25;

const existingIds = computed(() => new Set((props.existingTest ?? []).map((item) => item.id).filter(Boolean)));

const loadedIds = computed(() =>
  cases.value.map((item) => item.id).filter((id): id is string => Boolean(id) && !existingIds.value.has(id)),
);

const isRowSelected = (id: string): boolean =>
  selectAll.value ? !selectedIds.value.has(id) : selectedIds.value.has(id);

const allLoadedSelected = computed(
  () => loadedIds.value.length > 0 && loadedIds.value.every((id) => isRowSelected(id)),
);

const selectionIndeterminate = computed(() => {
  if (selectAll.value) {
    return selectedIds.value.size > 0;
  }
  const selectedOnPage = loadedIds.value.filter((id) => selectedIds.value.has(id)).length;
  return selectedOnPage > 0 && selectedOnPage < loadedIds.value.length;
});

const selectionCount = computed(() => {
  if (selectAll.value) {
    return Math.max(0, totalCount.value - existingIds.value.size - selectedIds.value.size);
  }
  return selectedIds.value.size;
});

function currentFilter(): AddTestCaseListFilter {
  const table = tableFilter.value.trim();
  const entityLink = table ? `<#E::table::${table}>` : undefined;
  const column = columnFilter.value.trim() || undefined;
  return {
    q: searchValue.value.trim() || undefined,
    testCaseStatus: statusFilter.value,
    testCaseType: typeFilter.value,
    entityLink,
    includeAllTests: entityLink ? true : undefined,
    columnName: column || undefined,
    tableFqn: table || undefined,
  };
}

async function loadCases(reset = true): Promise<void> {
  loading.value = true;
  try {
    if (reset) {
      offset.value = 0;
      cases.value = [];
    }
    const page = await listTestCasesBySearch({
      ...currentFilter(),
      limit: pageSize,
      offset: offset.value,
    });
    const rows = page.data;
    const fresh = rows.filter((item) => item.id && !existingIds.value.has(item.id));
    if (reset) {
      cases.value = fresh;
    } else {
      cases.value = [...cases.value, ...fresh];
    }
    totalCount.value = page.paging?.total ?? cases.value.length;
    offset.value += pageSize;
  } finally {
    loading.value = false;
  }
}

function toggleSelectAll(checked: boolean): void {
  selectAll.value = checked;
  selectedIds.value = new Set();
}

function toggleRow(id: string, checked: boolean): void {
  const next = new Set(selectedIds.value);
  if (selectAll.value) {
    if (checked) {
      next.delete(id);
    } else {
      next.add(id);
    }
  } else if (checked) {
    next.add(id);
  } else {
    next.delete(id);
  }
  selectedIds.value = next;
}

function onSubmit(): void {
  const includeIds = selectAll.value ? [] : [...selectedIds.value];
  const excludeIds = selectAll.value ? [...selectedIds.value] : [];
  const payload: AddTestCaseListSubmitPayload = {
    selectAll: selectAll.value,
    includeIds,
    excludeIds,
    filter: selectAll.value ? currentFilter() : undefined,
  };
  emit('submit', payload);
}

onMounted(() => {
  void loadCases(true);
});

watch([searchValue, statusFilter, typeFilter, tableFilter, columnFilter], () => {
  void loadCases(true);
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
    <Space wrap class="add-test-case-list__filters">
      <Select
        v-model:value="statusFilter"
        allow-clear
        :placeholder="t('label.status')"
        style="min-width: 120px"
        data-testid="add-test-case-status-filter"
      >
        <Select.Option v-for="status in TEST_CASE_STATUSES" :key="status" :value="status">
          {{ status }}
        </Select.Option>
      </Select>
      <Select
        v-model:value="typeFilter"
        allow-clear
        :placeholder="t('label.type')"
        style="min-width: 120px"
        data-testid="add-test-case-type-filter"
      >
        <Select.Option v-for="type in TEST_CASE_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
      </Select>
      <Input
        v-model:value="tableFilter"
        :placeholder="t('label.table')"
        style="width: 140px"
        data-testid="add-test-case-table-filter"
      />
      <Input
        v-model:value="columnFilter"
        :placeholder="t('label.column')"
        style="width: 120px"
        data-testid="add-test-case-column-filter"
      />
    </Space>
    <div class="add-test-case-list__toolbar">
      <Checkbox
        :checked="selectAll ? !selectionIndeterminate && allLoadedSelected : allLoadedSelected"
        :indeterminate="selectionIndeterminate"
        data-testid="add-test-case-select-all"
        @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
      >
        {{ t('label.select-all-entity', { entity: t('label.test-case-plural') }) }}
      </Checkbox>
      <span class="add-test-case-list__count" data-testid="add-test-case-selection-count">
        {{ selectionCount }} {{ t('label.test-case-plural') }}
      </span>
    </div>
    <Spin :spinning="loading">
      <div class="add-test-case-list__rows" data-testid="add-test-case-rows">
        <label v-for="item in cases" :key="item.id" class="add-test-case-list__row">
          <Checkbox
            :checked="isRowSelected(item.id)"
            :data-testid="`add-test-case-row-${item.id}`"
            @change="toggleRow(item.id, ($event.target as HTMLInputElement).checked)"
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
.add-test-case-list__filters {
  margin-top: 4px;
}
.add-test-case-list__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.add-test-case-list__count {
  color: var(--sm-text-secondary);
  font-size: 12px;
}
.add-test-case-list__rows {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--sm-border-color, #f0f0f0);
  border-radius: 6px;
  padding: 8px;
}
.add-test-case-list__row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 4px;
  cursor: pointer;
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