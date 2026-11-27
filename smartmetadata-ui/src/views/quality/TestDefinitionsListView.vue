<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Test Library list chrome: heading 数据质量规则 (nav child stays
  测试库), filters, columns, enabled toggle, edit/delete, page size 15.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Switch, Table, Typography, message } from 'ant-design-vue';
import {
  DeleteOutlined,
  EditOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons-vue';
import {
  createTestDefinition,
  deleteTestDefinition,
  listTestDefinitions,
  patchTestDefinition,
  updateTestDefinition,
} from '@/api/testDefinitions';
import TestDefinitionFormDrawer from '@/components/quality/TestDefinitionFormDrawer.vue';
import TestLibraryFilterDropdown from '@/components/quality/TestLibraryFilterDropdown.vue';
import {
  TEST_LIBRARY_ENTITY_TYPES,
  TEST_LIBRARY_PAGE_SIZE,
  TEST_LIBRARY_PAGE_SIZE_OPTIONS,
  TEST_LIBRARY_PLATFORMS,
  formatTestPlatforms,
  isEnabledToggleDisabled,
  isSystemTestDefinition,
  pageCount,
} from '@/quality/testLibrary';
import {
  createEmptyTestDefinitionForm,
  toCreateTestDefinitionRequest,
  type TestDefinitionFormValues,
} from '@/quality/testDefinitionForm';
import type { TestDefinition } from '@/types/quality';

const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const definitions = ref<TestDefinition[]>([]);
const total = ref(0);
const pageAfter = ref<string | undefined>();
const pageBefore = ref<string | undefined>();
const cursorAfter = ref<string | undefined>();
const cursorBefore = ref<string | undefined>();
const currentPage = ref(1);
const pageSize = ref(TEST_LIBRARY_PAGE_SIZE);
const entityType = ref<string | undefined>();
const testPlatform = ref<string | undefined>();
const searchQuery = ref('');
const drawerOpen = ref(false);
const editing = ref<TestDefinition | undefined>();
const saving = ref(false);
const togglingId = ref<string | undefined>();

const entityTypeOptions = computed(() =>
  TEST_LIBRARY_ENTITY_TYPES.map((key) => ({
    key,
    label: t(`quality.testDefinitions.entityTypeOption.${key}`),
  })),
);
const platformOptions = computed(() =>
  TEST_LIBRARY_PLATFORMS.map((key) => ({ key, label: key })),
);

const columns = computed(() => [
  { title: t('quality.testDefinitions.columnName'), dataIndex: 'name', key: 'name' },
  { title: t('quality.testDefinitions.columnDescription'), dataIndex: 'description', key: 'description' },
  { title: t('quality.testDefinitions.entityType'), dataIndex: 'entityType', key: 'entityType', width: 120 },
  { title: t('quality.testDefinitions.platforms'), key: 'testPlatforms', width: 180 },
  { title: t('quality.testDefinitions.enabled'), key: 'enabled', width: 90 },
  { title: t('quality.testDefinitions.actions'), key: 'actions', width: 90 },
]);

const totalPages = computed(() => pageCount(total.value, pageSize.value));
const hasPrev = computed(() => currentPage.value > 1);
const hasNext = computed(() => currentPage.value < totalPages.value || Boolean(pageAfter.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTestDefinitions({
      limit: pageSize.value,
      after: cursorBefore.value ? undefined : cursorAfter.value,
      before: cursorBefore.value,
      entityType: entityType.value,
      testPlatform: testPlatform.value,
      q: searchQuery.value.trim() || undefined,
      sortField: 'displayName',
      sortOrder: 'asc',
    });
    definitions.value = page.data;
    total.value = page.total ?? page.data.length;
    pageAfter.value = page.after;
    pageBefore.value = page.before;
  } catch (error) {
    definitions.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function resetAndLoad(): void {
  currentPage.value = 1;
  cursorAfter.value = undefined;
  cursorBefore.value = undefined;
  void load();
}

function onNext(): void {
  if (!pageAfter.value) {
    return;
  }
  cursorBefore.value = undefined;
  cursorAfter.value = pageAfter.value;
  currentPage.value += 1;
  void load();
}

function onPrev(): void {
  if (!hasPrev.value) {
    return;
  }
  cursorAfter.value = undefined;
  if (pageBefore.value) {
    cursorBefore.value = pageBefore.value;
    currentPage.value -= 1;
    void load();
    return;
  }
  const target = currentPage.value - 1;
  currentPage.value = 1;
  cursorBefore.value = undefined;
  void (async () => {
    await load();
    while (currentPage.value < target && pageAfter.value) {
      cursorAfter.value = pageAfter.value;
      currentPage.value += 1;
      await load();
    }
  })();
}

function onPageSizeChange(size: number): void {
  pageSize.value = size;
  resetAndLoad();
}

function openCreate(): void {
  editing.value = undefined;
  drawerOpen.value = true;
}

function openEdit(record: TestDefinition): void {
  editing.value = record;
  drawerOpen.value = true;
}

async function onSave(values: TestDefinitionFormValues): Promise<void> {
  saving.value = true;
  try {
    if (editing.value && isSystemTestDefinition(editing.value)) {
      const current = editing.value.dataQualityDimension;
      const next = values.dataQualityDimension;
      const operations: Array<{ op: string; path: string; value?: unknown }> = [];
      if (current === next) {
        drawerOpen.value = false;
        return;
      }
      if (next && current) {
        operations.push({ op: 'replace', path: '/dataQualityDimension', value: next });
      } else if (next) {
        operations.push({ op: 'add', path: '/dataQualityDimension', value: next });
      } else {
        operations.push({ op: 'remove', path: '/dataQualityDimension' });
      }
      await patchTestDefinition(editing.value.id, operations);
      message.success(t('quality.testDefinitions.updated'));
    } else if (editing.value) {
      await updateTestDefinition({ ...toCreateTestDefinitionRequest(values), name: editing.value.name });
      message.success(t('quality.testDefinitions.updated'));
    } else {
      const created = await createTestDefinition(toCreateTestDefinitionRequest(values));
      message.success(t('quality.testDefinitions.created', { name: created.name }));
    }
    drawerOpen.value = false;
    Object.assign(values, createEmptyTestDefinitionForm());
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    saving.value = false;
  }
}

async function onEnableToggle(record: TestDefinition, checked: boolean): Promise<void> {
  if (isEnabledToggleDisabled(record) || checked === (record.enabled ?? true)) {
    return;
  }
  togglingId.value = record.id;
  try {
    await patchTestDefinition(record.id, [{ op: 'replace', path: '/enabled', value: checked }]);
    definitions.value = definitions.value.map((item) =>
      item.id === record.id ? { ...item, enabled: checked } : item,
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.saveFailed'));
  } finally {
    togglingId.value = undefined;
  }
}

function onDelete(record: TestDefinition): void {
  if (isSystemTestDefinition(record)) {
    return;
  }
  Modal.confirm({
    title: t('quality.testDefinitions.deleteTitle', { name: record.displayName || record.name }),
    content: t('quality.testDefinitions.deleteConfirm'),
    okText: t('quality.testDefinitions.delete'),
    cancelText: t('quality.testDefinitions.cancel'),
    okButtonProps: { danger: true, 'data-testid': 'confirm-delete-test-definition' },
    async onOk() {
      await deleteTestDefinition(record.fullyQualifiedName || record.name, {
        hardDelete: true,
        recursive: true,
      });
      message.success(t('quality.testDefinitions.deleted', { name: record.name }));
      await load();
    },
  });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="test-library-page" data-testid="test-library-page">
    <div class="test-library-page__header">
      <div>
        <Typography.Title :level="4" class="test-library-page__title">
          {{ t('quality.testDefinitions.pageTitle') }}
        </Typography.Title>
        <Typography.Paragraph type="secondary" class="test-library-page__lead">
          {{ t('quality.testDefinitions.lead') }}
        </Typography.Paragraph>
      </div>
      <Button type="primary" data-testid="create-test-definition" @click="openCreate">
        {{ t('quality.testDefinitions.create') }}
      </Button>
    </div>

    <div class="test-library-page__filters">
      <TestLibraryFilterDropdown
        :label="t('quality.testDefinitions.entityType')"
        :search-placeholder="t('quality.testDefinitions.searchEntityType')"
        :options="entityTypeOptions"
        :model-value="entityType"
        test-id="test-library-filter-entity"
        @update:model-value="(value) => { entityType = value; resetAndLoad(); }"
      />
      <TestLibraryFilterDropdown
        :label="t('quality.testDefinitions.platforms')"
        :search-placeholder="t('quality.testDefinitions.searchPlatform')"
        :options="platformOptions"
        :model-value="testPlatform"
        test-id="test-library-filter-platform"
        @update:model-value="(value) => { testPlatform = value; resetAndLoad(); }"
      />
    </div>

    <p v-if="errorMessage" data-testid="test-library-error">{{ errorMessage }}</p>

    <Table
      :columns="columns"
      :data-source="definitions"
      :loading="loading"
      :pagination="false"
      row-key="id"
      data-testid="test-definitions-table"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span :data-testid="`test-definition-row-${(record as TestDefinition).id}`">
            {{ (record as TestDefinition).displayName || (record as TestDefinition).name }}
          </span>
        </template>
        <template v-else-if="column.key === 'description'">
          {{ (record as TestDefinition).description || '' }}
        </template>
        <template v-else-if="column.key === 'testPlatforms'">
          {{ formatTestPlatforms((record as TestDefinition).testPlatforms) }}
        </template>
        <template v-else-if="column.key === 'enabled'">
          <Switch
            :checked="(record as TestDefinition).enabled ?? true"
            :disabled="isEnabledToggleDisabled(record as TestDefinition)"
            :loading="togglingId === (record as TestDefinition).id"
            :data-testid="`enable-switch-${(record as TestDefinition).name}`"
            @change="(checked) => onEnableToggle(record as TestDefinition, Boolean(checked))"
          />
        </template>
        <template v-else-if="column.key === 'actions'">
          <Button
            type="text"
            size="small"
            :data-testid="`edit-test-definition-${(record as TestDefinition).name}`"
            @click="openEdit(record as TestDefinition)"
          >
            <EditOutlined />
          </Button>
          <Button
            type="text"
            size="small"
            danger
            :disabled="isSystemTestDefinition(record as TestDefinition)"
            :data-testid="`delete-test-definition-${(record as TestDefinition).name}`"
            @click="onDelete(record as TestDefinition)"
          >
            <DeleteOutlined />
          </Button>
        </template>
      </template>
    </Table>

    <div class="test-library-page__pager" data-testid="test-library-pagination">
      <Button type="link" :disabled="!hasPrev" data-testid="test-library-prev" @click="onPrev">
        <LeftOutlined />
        {{ t('quality.testDefinitions.prevPage') }}
      </Button>
      <span data-testid="test-library-page-indicator">
        {{ t('quality.testDefinitions.pageOf', { current: currentPage, total: totalPages }) }}
      </span>
      <Button type="link" :disabled="!hasNext" data-testid="test-library-next" @click="onNext">
        {{ t('quality.testDefinitions.nextPage') }}
        <RightOutlined />
      </Button>
      <select
        :value="pageSize"
        data-testid="test-library-page-size"
        @change="onPageSizeChange(Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="size in TEST_LIBRARY_PAGE_SIZE_OPTIONS" :key="size" :value="size">
          {{ t('quality.testDefinitions.perPage', { size }) }}
        </option>
      </select>
    </div>

    <TestDefinitionFormDrawer
      :open="drawerOpen"
      :definition="editing"
      :saving="saving"
      @update:open="(value) => { drawerOpen = value; }"
      @save="onSave"
    />
  </div>
</template>

<style scoped>
.test-library-page {
  padding: 16px 24px 32px;
}
.test-library-page__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.test-library-page__title {
  margin-bottom: 4px !important;
}
.test-library-page__lead {
  margin-bottom: 0 !important;
}
.test-library-page__filters {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.test-library-page__pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
