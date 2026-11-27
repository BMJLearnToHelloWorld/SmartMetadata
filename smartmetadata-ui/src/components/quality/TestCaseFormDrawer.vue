<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestCaseFormDrawer + TestCaseFormBody fields (Vue3 + ant-design-vue).
  Layout: form column + official help / entity summary. No CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Drawer, Form, Input, InputNumber, Select, Space, Spin, Typography } from 'ant-design-vue';
import { fetchAssetDetail } from '@/api/entities';
import { listGlossaryTerms } from '@/api/glossaryTerms';
import { searchAssets } from '@/api/search';
import { listTags } from '@/api/tags';
import { createTestCase, updateTestCase } from '@/api/testCases';
import { listTestDefinitions } from '@/api/testDefinitions';
import type { AssetDetail, SearchHit, TagRef } from '@/types/api';
import TableDiffFields from '@/features/quality/TableDiffFields.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import type { TestCase, TestDefinition } from '@/types/quality';
import {
  DEFAULT_TOP_DIMENSIONS,
  MAX_TOP_DIMENSIONS,
  MIN_TOP_DIMENSIONS,
  TEST_LEVEL,
  type TestCaseFormValues,
  type TestLevel,
  createEmptyTestCaseForm,
  customSqlTypeForLevel,
  entityTypeForLevel,
  formValuesFromTestCase,
  helpForField,
  toCreateRequest,
} from '@/quality/testCaseForm';

const props = defineProps<{
  open: boolean;
  testCase?: TestCase;
  /** Official TabFilters onTestCaseDrawerOpen(formType) seeds the create form. */
  initialTableFqn?: string;
  initialTestLevel?: TestLevel;
}>();

const emit = defineEmits<{
  cancel: [];
  submitted: [testCase: TestCase];
}>();

const { t } = useI18n();
const saving = ref(false);
const loadingTable = ref(false);
const errorMessage = ref('');
const activeField = ref('testLevel');
const form = reactive<TestCaseFormValues>(createEmptyTestCaseForm());
const tableOptions = ref<{ value: string; label: string }[]>([]);
const tableDetail = ref<AssetDetail | undefined>();
const definitions = ref<TestDefinition[]>([]);
const tagOptions = ref<{ value: string; label: string; source: 'Classification' }[]>([]);
const glossaryOptions = ref<{ value: string; label: string; source: 'Glossary' }[]>([]);

const isEdit = computed(() => Boolean(props.testCase));
const title = computed(() =>
  isEdit.value
    ? t('label.edit-entity', { entity: t('label.test-case') })
    : t('label.add-entity', { entity: t('label.test-case') }),
);
const okText = computed(() => (isEdit.value ? t('label.update') : t('label.create')));

const LEVEL_LABEL: Record<string, string> = {
  [TEST_LEVEL.TABLE]: 'label.table-level',
  [TEST_LEVEL.COLUMN]: 'label.column-level',
  [TEST_LEVEL.COLUMN_DIMENSION]: 'label.column-with-dimension',
};
const LEVEL_HINT_ENTITY: Record<string, string> = {
  [TEST_LEVEL.TABLE]: 'label.table-lowercase',
  [TEST_LEVEL.COLUMN]: 'label.column-lowercase',
  [TEST_LEVEL.COLUMN_DIMENSION]: 'label.column-lowercase',
};
const showDimensionFields = computed(
  () => form.testLevel === TEST_LEVEL.COLUMN_DIMENSION || (isEdit.value && form.testLevel === TEST_LEVEL.COLUMN && form.dimensionColumns.length > 0),
);
const columnOptions = computed(() => flattenColumns(tableDetail.value?.schemaRows ?? []).map((name) => ({ value: name, label: name })));
const dimensionOptions = computed(() =>
  columnOptions.value.filter((option) => option.value !== form.selectedColumn),
);
const visibleDefinitions = computed(() => {
  const wanted = entityTypeForLevel(form.testLevel);
  return definitions.value.filter((item) => !item.entityType || item.entityType.toUpperCase() === wanted);
});
const selectedDefinition = computed(() =>
  visibleDefinitions.value.find(
    (item) => item.fullyQualifiedName === form.testTypeId || item.name === form.testTypeId,
  ),
);
const isTableDiff = computed(() => {
  const definition = selectedDefinition.value;
  const id = (definition?.fullyQualifiedName || definition?.name || '').split('.').pop();
  return id === 'tableDiff';
});
const help = computed(() => helpForField(activeField.value));
const selectedTagFqns = computed({
  get: () => form.tags.map((tag) => tag.tagFQN),
  set: (values: string[]) => {
    form.tags = values.map((value) => {
      const option = tagOptions.value.find((item) => item.value === value);
      return { tagFQN: value, name: option?.label, source: 'Classification' as const, labelType: 'Manual', state: 'Confirmed' };
    });
  },
});
const selectedGlossaryFqns = computed({
  get: () => form.glossaryTerms.map((tag) => tag.tagFQN),
  set: (values: string[]) => {
    form.glossaryTerms = values.map((value) => {
      const option = glossaryOptions.value.find((item) => item.value === value);
      return { tagFQN: value, name: option?.label, source: 'Glossary' as const, labelType: 'Manual', state: 'Confirmed' };
    });
  },
});

function flattenColumns(rows: { name: string; children?: { name: string; children?: unknown[] }[] }[], prefix = ''): string[] {
  const names: string[] = [];
  for (const row of rows) {
    const name = prefix ? `${prefix}.${row.name}` : row.name;
    names.push(name);
    if (row.children?.length) {
      names.push(...flattenColumns(row.children as typeof rows, name));
    }
  }
  return names;
}

async function resetForm(): Promise<void> {
  errorMessage.value = '';
  activeField.value = isEdit.value ? 'table' : 'testLevel';
  Object.assign(form, props.testCase ? formValuesFromTestCase(props.testCase) : createEmptyTestCaseForm());
  if (!props.testCase) {
    if (props.initialTestLevel) {
      form.testLevel = props.initialTestLevel;
    }
    if (props.initialTableFqn) {
      form.selectedTable = props.initialTableFqn;
    }
  }
  tableDetail.value = undefined;
  if (form.selectedTable) {
    await loadTable(form.selectedTable);
  }
  await loadDefinitions();
}

async function loadDefinitions(): Promise<void> {
  try {
    const page = await listTestDefinitions({ limit: 200, entityType: entityTypeForLevel(form.testLevel) });
    definitions.value = page.data;
  } catch {
    definitions.value = [];
  }
}

async function searchTables(query: string): Promise<void> {
  const page = await searchAssets(query || '*', 0, 25, { index: 'table', includeAggregations: false });
  tableOptions.value = page.hits.map((hit: SearchHit) => ({
    value: hit.fullyQualifiedName,
    label: hit.displayName || hit.name || hit.fullyQualifiedName,
  }));
}

async function loadTable(fqn: string): Promise<void> {
  if (!fqn) {
    tableDetail.value = undefined;
    return;
  }
  loadingTable.value = true;
  try {
    tableDetail.value = await fetchAssetDetail('table', fqn);
    if (!tableOptions.value.some((item) => item.value === fqn)) {
      tableOptions.value = [
        ...tableOptions.value,
        { value: fqn, label: tableDetail.value.displayName || tableDetail.value.name || fqn },
      ];
    }
  } catch {
    tableDetail.value = undefined;
  } finally {
    loadingTable.value = false;
  }
}

async function searchTagOptions(query: string): Promise<void> {
  try {
    const page = await listTags({ limit: 100 });
    const needle = query.trim().toLowerCase();
    tagOptions.value = page.data
      .map((tag) => ({
        value: tag.fullyQualifiedName || tag.name,
        label: tag.displayName || tag.name,
        source: 'Classification' as const,
      }))
      .filter((item) => !needle || item.label.toLowerCase().includes(needle) || item.value.toLowerCase().includes(needle));
  } catch {
    tagOptions.value = [];
  }
}

async function searchGlossaryOptions(query: string): Promise<void> {
  try {
    const page = await listGlossaryTerms({ limit: 100 });
    const needle = query.trim().toLowerCase();
    glossaryOptions.value = page.data
      .map((term) => ({
        value: term.fullyQualifiedName || term.name,
        label: term.displayName || term.name,
        source: 'Glossary' as const,
      }))
      .filter((item) => !needle || item.label.toLowerCase().includes(needle) || item.value.toLowerCase().includes(needle));
  } catch {
    glossaryOptions.value = [];
  }
}

function setLevel(level: TestLevel): void {
  if (isEdit.value) {
    return;
  }
  form.testLevel = level;
  if (level === TEST_LEVEL.TABLE) {
    form.selectedColumn = undefined;
    form.dimensionColumns = [];
  }
  if (level !== TEST_LEVEL.COLUMN_DIMENSION) {
    form.dimensionColumns = [];
  }
  form.testTypeId = undefined;
  void loadDefinitions();
}

function useCustomSql(): void {
  form.testTypeId = customSqlTypeForLevel(form.testLevel);
  activeField.value = 'testType';
}

async function onSubmit(): Promise<void> {
  errorMessage.value = '';
  saving.value = true;
  try {
    const body = toCreateRequest(form);
    const saved = isEdit.value ? await updateTestCase(body) : await createTestCase(body);
    emit('submitted', saved);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : t(
            isEdit.value ? 'server.update-entity-error' : 'server.create-entity-error',
            { entity: t('label.test-case') },
          );
  } finally {
    saving.value = false;
  }
}

function close(): void {
  emit('cancel');
}

watch(
  () => [props.open, props.testCase?.id] as const,
  ([open]) => {
    if (open) {
      void resetForm();
      void searchTables('');
      void searchTagOptions('');
      void searchGlossaryOptions('');
    }
  },
);

watch(
  () => form.selectedTable,
  (fqn) => {
    if (props.open && fqn) {
      void loadTable(fqn);
    }
  },
);
</script>

<template>
  <Drawer
    :open="open"
    :title="title"
    placement="right"
    :width="'72vw'"
    :destroy-on-close="true"
    data-testid="test-case-form-drawer"
    @close="close"
  >
    <div class="tc-form">
      <div class="tc-form__main">
        <Spin :spinning="loadingTable">
          <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 16px" />
          <Form layout="vertical">
            <Form.Item v-if="!isEdit" required :label="t('message.select-test-level')">
              <div class="tc-form__levels" data-testid="test-case-levels">
                <button
                  v-for="level in [TEST_LEVEL.TABLE, TEST_LEVEL.COLUMN, TEST_LEVEL.COLUMN_DIMENSION]"
                  :key="level"
                  type="button"
                  class="tc-form__level"
                  :class="{ 'tc-form__level--active': form.testLevel === level }"
                  :data-testid="`test-case-level-${level}`"
                  @click="setLevel(level)"
                  @focus="activeField = 'testLevel'"
                >
                  <div class="tc-form__level-title">
                    {{ t(LEVEL_LABEL[level]) }}
                    <span v-if="level === TEST_LEVEL.COLUMN_DIMENSION" class="tc-form__beta">{{ t('shared.beta') }}</span>
                  </div>
                  <div class="tc-form__level-desc">{{ t('label.test-applied-on-entity', { entity: t(LEVEL_HINT_ENTITY[level]) }) }}</div>
                </button>
              </div>
            </Form.Item>
            <Form.Item :label="t('label.table')" required>
              <Select
                v-model:value="form.selectedTable"
                show-search
                :filter-option="false"
                :placeholder="t('label.select-entity', { entity: t('label.table') })"
                :options="tableOptions"
                :disabled="isEdit"
                allow-clear
                data-testid="test-case-table"
                @search="searchTables"
                @focus="activeField = 'table'"
              />
            </Form.Item>
            <Form.Item v-if="form.testLevel !== TEST_LEVEL.TABLE" :label="t('label.column')" required>
              <Select
                v-model:value="form.selectedColumn"
                show-search
                :placeholder="t('label.select-entity', { entity: t('label.column') })"
                :options="columnOptions"
                :disabled="isEdit || !form.selectedTable"
                allow-clear
                data-testid="test-case-column"
                @focus="activeField = 'column'"
              />
            </Form.Item>
            <template v-if="showDimensionFields">
              <Form.Item :label="t('label.dimension-plural')">
                <Select
                  v-model:value="form.dimensionColumns"
                  mode="multiple"
                  show-search
                  :placeholder="t('label.select-entity', { entity: t('label.dimension-plural') })"
                  :options="dimensionOptions"
                  data-testid="test-case-dimensions"
                  @focus="activeField = 'dimensionColumns'"
                />
              </Form.Item>
              <Form.Item :label="t('label.top-dimension-plural')">
                <InputNumber
                  v-model:value="form.topDimensions"
                  :min="MIN_TOP_DIMENSIONS"
                  :max="MAX_TOP_DIMENSIONS"
                  data-testid="test-case-top-dimensions"
                  @focus="activeField = 'topDimensions'"
                />
              </Form.Item>
            </template>
            <Form.Item :label="t('label.test-type')" required>
              <div class="tc-form__type-row">
                <Select
                  v-model:value="form.testTypeId"
                  show-search
                  option-filter-prop="label"
                  :placeholder="t('label.select-test-type')"
                  :disabled="isEdit"
                  data-testid="test-case-type"
                  @focus="activeField = 'testType'"
                >
                  <Select.Option
                    v-for="definition in visibleDefinitions"
                    :key="definition.id || definition.name"
                    :value="definition.fullyQualifiedName || definition.name"
                    :label="definition.displayName || definition.name"
                  >
                    <div>{{ definition.displayName || definition.name }}</div>
                    <Typography.Text v-if="definition.description" type="secondary">{{ definition.description }}</Typography.Text>
                  </Select.Option>
                </Select>
                <Button type="link" data-testid="test-case-custom-sql" @click="useCustomSql">
                  {{ t('label.custom-query') }}
                </Button>
              </div>
            </Form.Item>
            <TableDiffFields
              v-if="isTableDiff && selectedDefinition"
              :definitions="selectedDefinition.parameterDefinition"
              entity-type="table"
              :entity-fqn="form.selectedTable || ''"
              :model-value="form.parameterValues"
              @update:model-value="form.parameterValues = $event"
            />
            <template v-else-if="selectedDefinition?.parameterDefinition?.length">
              <Form.Item
                v-for="param in selectedDefinition.parameterDefinition"
                :key="param.name"
                :label="param.displayName || param.name"
                :required="param.required === true"
                :extra="param.description"
              >
                <Input
                  v-model:value="form.parameterValues[param.name]"
                  :data-testid="`test-case-param-${param.name}`"
                />
              </Form.Item>
            </template>
            <Form.Item :label="t('label.name')">
              <Input
                v-model:value="form.testName"
                :placeholder="t('message.enter-test-case-name')"
                data-testid="test-case-name"
                @focus="activeField = 'name'"
              />
            </Form.Item>
            <Form.Item v-if="isEdit" :label="t('label.display-name')">
              <Input v-model:value="form.displayName" data-testid="test-case-display-name" />
            </Form.Item>
            <Form.Item :label="t('label.description')">
              <SmRichTextEditor
                :key="testCase?.id || 'create'"
                :initial-value="form.description"
                data-testid="test-case-description"
                @text-change="form.description = $event"
              />
            </Form.Item>
            <Form.Item :label="t('label.tag-plural')">
              <Select
                v-model:value="selectedTagFqns"
                mode="multiple"
                show-search
                :filter-option="false"
                :placeholder="t('label.select-field', { field: t('label.tag-plural') })"
                :options="tagOptions"
                data-testid="test-case-tags"
                @search="searchTagOptions"
              />
            </Form.Item>
            <Form.Item :label="t('label.glossary-term-plural')">
              <Select
                v-model:value="selectedGlossaryFqns"
                mode="multiple"
                show-search
                :filter-option="false"
                :placeholder="t('label.select-field', { field: t('label.glossary-term-plural') })"
                :options="glossaryOptions"
                data-testid="test-case-glossary"
                @search="searchGlossaryOptions"
              />
            </Form.Item>
          </Form>
        </Spin>
      </div>
      <aside class="tc-form__side" data-testid="test-case-form-side">
        <template v-if="isEdit && tableDetail">
          <Typography.Title :level="5">{{ tableDetail.displayName || tableDetail.name }}</Typography.Title>
          <Typography.Paragraph type="secondary">{{ tableDetail.description || t('label.no-description') }}</Typography.Paragraph>
          <p>{{ t('label.table-type') }}: {{ tableDetail.tableType || '—' }}</p>
          <p>{{ t('label.column-plural') }}: {{ tableDetail.schemaRows.length }}</p>
        </template>
        <template v-else>
          <Typography.Title :level="4">Data Quality</Typography.Title>
          <Typography.Title :level="5">{{ help.title }}</Typography.Title>
          <Typography.Paragraph>{{ help.body }}</Typography.Paragraph>
        </template>
      </aside>
    </div>
    <template #footer>
      <Space style="display: flex; justify-content: flex-end; width: 100%">
        <Button data-testid="test-case-form-cancel" @click="close">{{ t('label.cancel') }}</Button>
        <Button type="primary" :loading="saving" data-testid="test-case-form-submit" @click="onSubmit">{{ okText }}</Button>
      </Space>
    </template>
  </Drawer>
</template>

<style scoped>
.tc-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 24px;
  min-height: 100%;
}
.tc-form__levels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.tc-form__level {
  text-align: left;
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  background: var(--sm-bg-container);
  padding: 12px;
  cursor: pointer;
}
.tc-form__level--active {
  border-color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
}
.tc-form__level-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.tc-form__level-desc {
  color: rgba(0, 0, 0, 0.55);
  font-size: 12px;
}
.tc-form__beta {
  margin-left: 8px;
  font-weight: 400;
  font-size: 12px;
  color: var(--sm-color-warning-text);
}
.tc-form__type-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.tc-form__type-row :deep(.ant-select) {
  flex: 1;
}
.tc-form__side {
  border-left: 1px solid var(--sm-border-color);
  padding-left: 16px;
}
@media (max-width: 900px) {
  .tc-form {
    grid-template-columns: 1fr;
  }
  .tc-form__side {
    border-left: 0;
    padding-left: 0;
  }
}
</style>
