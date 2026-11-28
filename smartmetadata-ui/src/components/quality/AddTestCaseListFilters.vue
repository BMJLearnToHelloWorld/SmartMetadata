<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Pin AddTestCaseListFilters.component.tsx.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Select, Spin, Typography } from 'ant-design-vue';
import type { AddTestCaseListFilterOption } from '@/quality/addTestCaseListFilterOptions';

export type AddTestCaseListFilterKey = 'status' | 'testType' | 'table' | 'column';

const props = defineProps<{
  statusOptions: AddTestCaseListFilterOption[];
  typeOptions: AddTestCaseListFilterOption[];
  tableOptions: AddTestCaseListFilterOption[];
  columnOptions: AddTestCaseListFilterOption[];
  statusValue?: string;
  typeValue?: string;
  tableValue?: string;
  columnValue?: string;
  tableLoading?: boolean;
  columnLoading?: boolean;
}>();

const emit = defineEmits<{
  statusChange: [value: string | undefined];
  typeChange: [value: string | undefined];
  tableChange: [value: string | undefined];
  columnChange: [value: string | undefined];
  tableSearch: [search: string];
  columnSearch: [search: string];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="add-test-case-filters" data-testid="add-test-case-filters">
    <Typography.Text>{{ t('label.filter-plural') }}:</Typography.Text>
    <Select
      allow-clear
      :placeholder="t('label.status')"
      :value="props.statusValue"
      :options="props.statusOptions"
      style="min-width: 120px"
      data-testid="add-test-case-status-filter"
      @change="(v) => emit('statusChange', v as string | undefined)"
    />
    <Select
      allow-clear
      :placeholder="t('label.test-type')"
      :value="props.typeValue"
      :options="props.typeOptions"
      style="min-width: 120px"
      data-testid="add-test-case-type-filter"
      @change="(v) => emit('typeChange', v as string | undefined)"
    />
    <Select
      allow-clear
      show-search
      :filter-option="false"
      :placeholder="t('label.table')"
      :value="props.tableValue"
      :options="props.tableOptions.map((o) => ({ value: o.value, label: o.label }))"
      :loading="props.tableLoading"
      style="min-width: 160px"
      data-testid="add-test-case-table-filter"
      @search="(v) => emit('tableSearch', v)"
      @change="(v) => emit('tableChange', v as string | undefined)"
    >
      <template v-if="props.tableLoading" #notFoundContent>
        <Spin size="small" />
      </template>
    </Select>
    <Select
      allow-clear
      show-search
      :filter-option="false"
      :placeholder="t('label.column')"
      :value="props.columnValue"
      :options="props.columnOptions.map((o) => ({ value: o.value, label: o.label }))"
      :loading="props.columnLoading"
      style="min-width: 140px"
      data-testid="add-test-case-column-filter"
      @search="(v) => emit('columnSearch', v)"
      @change="(v) => emit('columnChange', v as string | undefined)"
    >
      <template v-if="props.columnLoading" #notFoundContent>
        <Spin size="small" />
      </template>
    </Select>
  </div>
</template>

<style scoped>
.add-test-case-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>