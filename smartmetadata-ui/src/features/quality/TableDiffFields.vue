<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  tableDiff专属参数表单（官方 TableDiffFields.tsx 的等价物，dev_ui 表单语言）。

  按所选定义的 parameterDefinition 顺序渲染：table2 用表搜索下拉；
  keyColumns / useColumns 用表 1 的列多选（tags 模式，可直接输入列名）；
  table2.keyColumns 用表 2 的列多选；其余参数按 dataType 渲染
  （NUMBER 用数字输入，BOOLEAN 用开关，STRING 用文本输入）。
  ARRAY 参数以 JSON 数组字符串提交（见 tableDiffParams.ts）。
  表 2 切换时清空表 2 的 key 列（官方行为）；表 1 / 表 2 的列加载失败时
  不阻塞输入——多选框仍接受直接输入的列名。
  ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, InputNumber, Select, Switch } from 'ant-design-vue';
import { searchAssets } from '@/api/search';
import { getTableByName, type TableColumnRef } from '@/api/tables';
import type { TestParameterDefinition } from '@/types/quality';
import {
  KEY_COLUMNS_PARAM,
  TABLE2_KEY_COLUMNS_PARAM,
  TABLE2_PARAM,
  USE_COLUMNS_PARAM,
  decodeArrayParam,
  encodeArrayParam,
} from './tableDiffParams';

const props = defineProps<{
  definitions: TestParameterDefinition[];
  modelValue: Record<string, string>;
  entityFqn: string;
  entityType: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, string>): void;
}>();

const { t } = useI18n();

const tableOptions = ref<Array<{ value: string; label: string }>>([]);
const tableSearchLoading = ref(false);
const table1Columns = ref<TableColumnRef[]>([]);
const table1LoadFailed = ref(false);
const table2Columns = ref<TableColumnRef[]>([]);

const table2Fqn = computed(() => (props.modelValue[TABLE2_PARAM] ?? '').trim());

function setParam(name: string, value: string): void {
  emit('update:modelValue', { ...props.modelValue, [name]: value });
}

function arrayValue(name: string): string[] {
  return decodeArrayParam(props.modelValue[name]);
}

function setArrayParam(name: string, values: string[]): void {
  setParam(name, values.length > 0 ? encodeArrayParam(values) : '');
}

function table1ColumnOptions(excluded: Set<string>): Array<{ value: string; label: string }> {
  return table1Columns.value
    .filter((column) => !excluded.has(column.name))
    .map((column) => ({ value: column.name, label: column.name }));
}

/** keyColumns 与 useColumns 互斥（官方 crossListExcludedColumns）：两边已选的列都不再出现在对方的选项里。 */
const crossListExcluded = computed(() => {
  const selected = new Set<string>([
    ...arrayValue(KEY_COLUMNS_PARAM),
    ...arrayValue(USE_COLUMNS_PARAM),
  ]);
  return selected;
});

let table1Timer: ReturnType<typeof setTimeout> | undefined;
let tableSearchTimer: ReturnType<typeof setTimeout> | undefined;

async function fetchTable1Columns(): Promise<void> {
  table1Columns.value = [];
  table1LoadFailed.value = false;
  if (props.entityType !== 'table' || !props.entityFqn.trim()) {
    return;
  }
  try {
    const table = await getTableByName(props.entityFqn.trim());
    table1Columns.value = table.columns;
  } catch {
    table1Columns.value = [];
    table1LoadFailed.value = true;
  }
}

async function fetchTableOptions(search: string): Promise<void> {
  tableSearchLoading.value = true;
  try {
    const page = await searchAssets(search.trim() || '*', 0, 20, { index: 'table' });
    tableOptions.value = page.hits.map((hit) => ({
      value: hit.fullyQualifiedName,
      label: hit.displayName || hit.fullyQualifiedName,
    }));
  } catch {
    tableOptions.value = [];
  } finally {
    tableSearchLoading.value = false;
  }
}

async function fetchTable2Columns(): Promise<void> {
  table2Columns.value = [];
  if (!table2Fqn.value) {
    return;
  }
  try {
    const table = await getTableByName(table2Fqn.value);
    table2Columns.value = table.columns;
  } catch {
    table2Columns.value = [];
  }
}

function onTableSearch(value: string): void {
  if (tableSearchTimer !== undefined) {
    clearTimeout(tableSearchTimer);
  }
  tableSearchTimer = setTimeout(() => void fetchTableOptions(value), 1000);
}

const previousTable2Fqn = ref<string | undefined>(table2Fqn.value);
watch(table2Fqn, (current) => {
  // 只在真正的表切换时清空表 2 的 key 列；编辑态预填（undefined -> fqn）
  // 不清空已保存的值（官方 TableDiffFields 同款保护）。
  const isTableSwap = Boolean(previousTable2Fqn.value) && Boolean(current);
  previousTable2Fqn.value = current;
  if (isTableSwap || !current) {
    setParam(TABLE2_KEY_COLUMNS_PARAM, '');
  }
  void fetchTable2Columns();
});

watch(
  () => [props.entityFqn, props.entityType],
  () => {
    if (table1Timer !== undefined) {
      clearTimeout(table1Timer);
    }
    table1Timer = setTimeout(() => void fetchTable1Columns(), 500);
  },
);

onMounted(() => {
  void fetchTableOptions('');
  void fetchTable1Columns();
  void fetchTable2Columns();
});

onUnmounted(() => {
  if (table1Timer !== undefined) {
    clearTimeout(table1Timer);
  }
  if (tableSearchTimer !== undefined) {
    clearTimeout(tableSearchTimer);
  }
});

function numberValue(name: string): number | undefined {
  const text = (props.modelValue[name] ?? '').trim();
  if (!text) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function onTable2Change(value: unknown): void {
  if (typeof value === 'string') {
    setParam(TABLE2_PARAM, value);
  }
}

function onArrayChange(name: string, value: unknown): void {
  if (Array.isArray(value)) {
    setArrayParam(
      name,
      value.filter((item): item is string => typeof item === 'string'),
    );
  }
}

function onNumberChange(name: string, value: unknown): void {
  if (value === null || value === undefined || value === '') {
    setParam(name, '');
    return;
  }
  setParam(name, String(value));
}

function onSwitchChange(name: string, checked: unknown): void {
  setParam(name, checked === true ? 'true' : 'false');
}
</script>

<template>
  <div>
    <template v-for="param in definitions" :key="param.name">
      <Form.Item
        :label="param.displayName || param.name"
        :required="param.required === true"
        :extra="param.description"
      >
        <Select
          v-if="param.name === TABLE2_PARAM"
          :value="modelValue[TABLE2_PARAM] || undefined"
          show-search
          :filter-option="false"
          :loading="tableSearchLoading"
          :options="tableOptions"
          :placeholder="t('quality.testCases.tableDiffSearchTable')"
          :data-testid="`table-diff-param-${TABLE2_PARAM}`"
          @search="onTableSearch"
          @change="onTable2Change"
        />
        <Select
          v-else-if="param.name === KEY_COLUMNS_PARAM || param.name === USE_COLUMNS_PARAM"
          mode="tags"
          :value="arrayValue(param.name)"
          :options="table1ColumnOptions(crossListExcluded)"
          :placeholder="t('quality.testCases.tableDiffTypeColumn')"
          :data-testid="`table-diff-param-${param.name}`"
          @change="(value: unknown) => onArrayChange(param.name, value)"
        />
        <Select
          v-else-if="param.name === TABLE2_KEY_COLUMNS_PARAM"
          mode="tags"
          :value="arrayValue(param.name)"
          :options="table2Columns.map((column) => ({ value: column.name, label: column.name }))"
          :disabled="!table2Fqn"
          :placeholder="t('quality.testCases.tableDiffTypeColumn')"
          :data-testid="`table-diff-param-${TABLE2_KEY_COLUMNS_PARAM}`"
          @change="(value: unknown) => onArrayChange(param.name, value)"
        />
        <InputNumber
          v-else-if="param.dataType === 'NUMBER'"
          :value="numberValue(param.name)"
          style="width: 100%"
          :data-testid="`table-diff-param-${param.name}`"
          @change="(value: unknown) => onNumberChange(param.name, value)"
        />
        <Switch
          v-else-if="param.dataType === 'BOOLEAN'"
          :checked="modelValue[param.name] === 'true'"
          :data-testid="`table-diff-param-${param.name}`"
          @change="(checked: unknown) => onSwitchChange(param.name, checked)"
        />
        <Input
          v-else
          :value="modelValue[param.name] ?? ''"
          :data-testid="`table-diff-param-${param.name}`"
          @input="(event: Event) => setParam(param.name, (event.target as HTMLInputElement).value)"
        />
      </Form.Item>
    </template>
    <p v-if="table1LoadFailed" class="table-diff-fields__hint">
      {{ t('quality.testCases.tableDiffColumnsUnavailable') }}
    </p>
  </div>
</template>

<style scoped>
.table-diff-fields__hint {
  color: var(--sm-text-secondary);
  margin-bottom: 0;
}
</style>
