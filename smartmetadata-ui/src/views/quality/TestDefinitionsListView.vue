<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Test Library list chrome: heading 数据质量规则 (nav child stays
  测试库), filters, columns, enabled toggle, edit/delete, page size 15.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  getDerivedPermissionFlags,
  permissionFlags,
  type OperationPermissions,
} from '@/api/permissions';
import { getErrorText } from '@/views/admin/accessApiErrors';
import type { TableProps } from 'ant-design-vue';
import { Button, Modal, Skeleton, Switch, Table, Tooltip, Typography, message } from 'ant-design-vue';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import LearningIcon from '@/components/shared/LearningIcon.vue';
import { createEmptyPaging } from '@/catalog/servicePaging';
import { useCursorPaging } from '@/ingestion/useCursorPaging';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { usePermissionStore } from '@/stores/permissions';
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
import TestDefinitionFilterBar from '@/components/quality/TestDefinitionFilterBar.vue';
import NoFilteredResultsPlaceholder from '@/components/shared/NoFilteredResultsPlaceholder.vue';
import {
  TEST_LIBRARY_ENTITY_TYPES,
  TEST_LIBRARY_PAGE_SIZE,
  TEST_LIBRARY_PAGE_SIZE_OPTIONS,
  TEST_LIBRARY_PLATFORMS,
  formatTestPlatforms,
  testLibraryEntityTypeLabel,
  isExternalTestDefinition,
  isSystemTestDefinition,
  pageCount,
  TEST_LIBRARY_COLUMN_BY_SORT_FIELD,
  TEST_LIBRARY_SORT_FIELD_BY_COLUMN,
} from '@/quality/testLibrary';
import {
  mergeTestDefinitionListQuery,
  parseTestDefinitionListQuery,
} from '@/quality/testDefinitionListUrl';
import {
  createEmptyTestDefinitionForm,
  toCreateTestDefinitionRequest,
  type TestDefinitionFormValues,
} from '@/quality/testDefinitionForm';
import type { TestDefinition } from '@/types/quality';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();
type PermState = 'loading' | 'denied' | 'error' | 'ready';
const permState = ref<PermState>('loading');
const createPermission = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const formErrorMessage = ref('');
const definitions = ref<TestDefinition[]>([]);
const listPaging = useCursorPaging(TEST_LIBRARY_PAGE_SIZE, [...TEST_LIBRARY_PAGE_SIZE_OPTIONS]);
const searchInput = ref('');
let loadToken = 0;

const listQuery = computed(() =>
  parseTestDefinitionListQuery(route.query as Record<string, unknown>),
);
const entityType = computed(() => listQuery.value.entityType);
const testPlatform = computed(() => listQuery.value.testPlatform);
const hasActiveFilters = computed(
  () =>
    listQuery.value.q.trim().length > 0 ||
    listQuery.value.entityType !== undefined ||
    listQuery.value.testPlatform !== undefined,
);
/** Official useListSearchInput SEARCH_DEBOUNCE_MS. */
const SEARCH_DEBOUNCE_MS = 300;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
const drawerOpen = ref(false);
const editing = ref<TestDefinition | undefined>();
const saving = ref(false);
const togglingId = ref<string | undefined>();
/** Per-row ops keyed by definition name (pin useTestDefinitionRowPermissions). */
const rowPermissions = ref<Record<string, OperationPermissions>>({});
const permissionLoadingCount = ref(0);
const hasFetchedRowPermissions = ref(false);
const permissionLoading = computed(
  () => !hasFetchedRowPermissions.value || permissionLoadingCount.value > 0,
);
/** Pin TestDefinitionTable isRefetching: dim rows in place, do not swap for overlay. */
const isInitialLoading = computed(() => loading.value && definitions.value.length === 0);
const isRefetching = computed(() => loading.value && definitions.value.length > 0);
const rowControlsDisabled = computed(() => isRefetching.value);

const entityTypeOptions = computed(() =>
  TEST_LIBRARY_ENTITY_TYPES.map((key) => ({
    key,
    label: testLibraryEntityTypeLabel(key, t),
  })),
);
const platformOptions = computed(() =>
  TEST_LIBRARY_PLATFORMS.map((key) => ({ key, label: key })),
);

const activeSortColumn = computed(
  () => TEST_LIBRARY_COLUMN_BY_SORT_FIELD[listQuery.value.sortField] ?? 'name',
);

const columns = computed<TableProps['columns']>(() => {
  const sortOrder =
    listQuery.value.sortOrder === 'desc'
      ? ('descend' as const)
      : ('ascend' as const);
  return [
    {
      title: t('label.name'),
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      sortOrder: activeSortColumn.value === 'name' ? sortOrder : undefined,
    },
    { title: t('label.description'), dataIndex: 'description', key: 'description' },
    {
      title: t('label.entity-type'),
      dataIndex: 'entityType',
      key: 'entityType',
      width: 120,
      sorter: true,
      sortOrder: activeSortColumn.value === 'entityType' ? sortOrder : undefined,
    },
    {
      title: t('label.test-platform-plural'),
      key: 'testPlatforms',
      width: 180,
      sorter: true,
      sortOrder: activeSortColumn.value === 'testPlatforms' ? sortOrder : undefined,
    },
    { title: t('label.enabled'), key: 'enabled', width: 90 },
    { title: t('label.action-plural'), key: 'actions', width: 90 },
  ];
});

const totalPages = computed(() =>
  pageCount(listPaging.paging.value.total, listPaging.pageSize.value),
);
const hasPrev = computed(
  () => listPaging.currentPage.value > 1 || Boolean(listPaging.paging.value.before),
);
const hasNext = computed(() => Boolean(listPaging.paging.value.after));

function applyListUrlPatch(
  patch: Record<string, string | number | boolean | string[] | null | undefined>,
): void {
  void router.replace({
    query: mergeTestDefinitionListQuery(route.query as Record<string, unknown>, patch),
  });
}

function onTableChange(
  _pagination: unknown,
  _filters: unknown,
  sorter: { columnKey?: string; field?: string; order?: 'ascend' | 'descend' | null },
): void {
  const columnKey = String(sorter.columnKey ?? sorter.field ?? '');
  const sortField = TEST_LIBRARY_SORT_FIELD_BY_COLUMN[columnKey];
  if (!sortField || sorter.order == null) {
    return;
  }
  applyListUrlPatch({
    sortField,
    sortOrder: sorter.order === 'descend' ? 'desc' : 'asc',
  });
}

watch(
  () => listQuery.value.q,
  (q) => {
    if (q !== searchInput.value) {
      searchInput.value = q;
    }
  },
  { immediate: true },
);

async function load(): Promise<void> {
  const token = ++loadToken;
  loading.value = true;
  errorMessage.value = '';
  try {
    const query = listQuery.value;
    const cursor = listPaging.pagingCursor.value;
    const page = await listTestDefinitions({
      limit: listPaging.pageSize.value,
      after: cursor.cursorType === 'after' ? cursor.cursorValue : undefined,
      before: cursor.cursorType === 'before' ? cursor.cursorValue : undefined,
      entityType: query.entityType,
      testPlatform: query.testPlatform,
      q: query.q.trim() || undefined,
      sortField: query.sortField,
      sortOrder: query.sortOrder,
    });
    if (token !== loadToken) {
      return;
    }
    definitions.value = page.data;
    listPaging.handlePagingChange({
      total: page.total ?? page.data.length,
      after: page.after ?? '',
      before: page.before ?? '',
    });
    void fetchRowPermissions(page.data);
  } catch (error) {
    if (token !== loadToken) {
      return;
    }
    definitions.value = [];
    listPaging.handlePagingChange(createEmptyPaging());
    errorMessage.value = getErrorText(error, t('server.unexpected-error'));
  } finally {
    if (token === loadToken) {
      loading.value = false;
    }
  }
}

function applySearch(value: string, immediate = false): void {
  searchInput.value = value;
  const run = () => applyListUrlPatch({ q: value || null });
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  if (immediate) {
    run();
    return;
  }
  searchTimer = setTimeout(run, SEARCH_DEBOUNCE_MS);
}

function onSearchUpdate(value: string): void {
  applySearch(value, value === '');
}

function onSearchPressEnter(): void {
  applySearch(searchInput.value, true);
}

onUnmounted(() => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});

function onNext(): void {
  if (!listPaging.paging.value.after) {
    return;
  }
  listPaging.handlePageChange(listPaging.currentPage.value + 1, {
    cursorType: 'after',
    cursorValue: listPaging.paging.value.after,
  });
}

function onPrev(): void {
  if (!hasPrev.value || !listPaging.paging.value.before) {
    return;
  }
  listPaging.handlePageChange(listPaging.currentPage.value - 1, {
    cursorType: 'before',
    cursorValue: listPaging.paging.value.before,
  });
}

function onPageSizeChange(size: number): void {
  listPaging.handlePageSizeChange(size);
}

async function fetchRowPermissions(rows: TestDefinition[]): Promise<void> {
  permissionLoadingCount.value += 1;
  try {
    const entries = await Promise.all(
      rows.map(async (definition) => {
        const fqn = definition.fullyQualifiedName;
        if (!fqn) {
          return [definition.name, {} as OperationPermissions] as const;
        }
        const ops = await permissionStore.getEntityPermissionByFqn('testDefinition', fqn);
        return [definition.name, ops] as const;
      }),
    );
    rowPermissions.value = Object.fromEntries(entries);
    hasFetchedRowPermissions.value = true;
  } catch {
    // Keep the previous map on failure; cells show skeleton until settled.
  } finally {
    permissionLoadingCount.value -= 1;
  }
}

function rowPermission(name: string): OperationPermissions | undefined {
  return rowPermissions.value[name];
}

function rowFlags(name: string) {
  const ops = rowPermission(name);
  return ops ? permissionFlags(ops) : getDerivedPermissionFlags(ops ?? {});
}

function enabledSwitchTooltip(definition: TestDefinition): string | undefined {
  if (isExternalTestDefinition(definition)) {
    return t('message.external-test-cannot-be-toggled');
  }
  if (!rowFlags(definition.name).canEditAll) {
    return t('message.no-permission-for-action');
  }
  return undefined;
}

function enabledSwitchDisabled(definition: TestDefinition): boolean {
  if (permissionLoading.value || !rowPermission(definition.name)) {
    return true;
  }
  return (
    isExternalTestDefinition(definition) ||
    !rowFlags(definition.name).canEditAll ||
    rowControlsDisabled.value
  );
}

function editActionTooltip(definition: TestDefinition): string {
  if (!rowFlags(definition.name).canEditAll) {
    return t('message.no-permission-for-action');
  }
  if (isSystemTestDefinition(definition)) {
    return t('message.system-test-definition-dimension-edit-only');
  }
  return t('label.edit');
}

function deleteActionTooltip(definition: TestDefinition): string {
  if (isSystemTestDefinition(definition)) {
    return t('message.system-test-definition-delete-warning');
  }
  if (rowFlags(definition.name).canDelete) {
    return t('label.delete');
  }
  return t('message.no-permission-for-action');
}

function editActionDisabled(definition: TestDefinition): boolean {
  if (permissionLoading.value || !rowPermission(definition.name)) {
    return true;
  }
  return !rowFlags(definition.name).canEditAll || rowControlsDisabled.value;
}

function deleteActionDisabled(definition: TestDefinition): boolean {
  if (permissionLoading.value || !rowPermission(definition.name)) {
    return true;
  }
  return (
    isSystemTestDefinition(definition) ||
    !rowFlags(definition.name).canDelete ||
    rowControlsDisabled.value
  );
}

function openCreate(): void {
  editing.value = undefined;
  formErrorMessage.value = '';
  drawerOpen.value = true;
}

function openEdit(record: TestDefinition): void {
  editing.value = record;
  formErrorMessage.value = '';
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
      message.success(t('server.update-entity-success', { entity: t('label.test-definition') }));
    } else if (editing.value) {
      await updateTestDefinition({ ...toCreateTestDefinitionRequest(values), name: editing.value.name });
      message.success(t('server.update-entity-success', { entity: t('label.test-definition') }));
    } else {
      const created = await createTestDefinition(toCreateTestDefinitionRequest(values));
      message.success(t('server.create-entity-success', { entity: t('label.test-definition') }));
    }
    formErrorMessage.value = '';
    drawerOpen.value = false;
    Object.assign(values, createEmptyTestDefinitionForm());
    await load();
  } catch (error) {
    formErrorMessage.value = getErrorText(
      error,
      t(
        editing.value ? 'server.update-entity-error' : 'server.create-entity-error',
        { entity: t('label.test-definition') },
      ),
    );
  } finally {
    saving.value = false;
  }
}

async function onEnableToggle(record: TestDefinition, checked: boolean): Promise<void> {
  if (enabledSwitchDisabled(record) || checked === (record.enabled ?? true)) {
    return;
  }
  togglingId.value = record.id;
  try {
    await patchTestDefinition(record.id, [{ op: 'replace', path: '/enabled', value: checked }]);
    definitions.value = definitions.value.map((item) =>
      item.id === record.id ? { ...item, enabled: checked } : item,
    );
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : t('server.update-entity-error', { entity: t('label.test-definition') }),
    );
  } finally {
    togglingId.value = undefined;
  }
}

function onDelete(record: TestDefinition): void {
  if (isSystemTestDefinition(record)) {
    return;
  }
  Modal.confirm({
    title: t('label.delete'),
    content: t('message.permanently-delete-common-message', { entity: record.displayName || record.name }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
    okButtonProps: { danger: true, 'data-testid': 'confirm-delete-test-definition' },
    async onOk() {
      await deleteTestDefinition(record.fullyQualifiedName || record.name, {
        hardDelete: true,
        recursive: true,
      });
      message.success(t('server.entity-deleted-successfully', { entity: record.displayName || record.name }));
      await load();
    },
  });
}

async function checkViewPermission(): Promise<boolean> {
  permState.value = 'loading';
  try {
    const operations = await permissionStore.getResourcePermission('testDefinition');
    const flags = getDerivedPermissionFlags(operations, false);
    const allowed = permissionStore.isAdminUser || flags.hasViewAccess;
    createPermission.value = permissionStore.isAdminUser || flags.canCreate;
    permState.value = allowed ? 'ready' : 'denied';
    return allowed;
  } catch {
    permState.value = 'error';
    createPermission.value = false;
    return false;
  }
}

function clearAllFilters(): void {
  searchInput.value = '';
  applyListUrlPatch({
    q: null,
    entityType: null,
    testPlatforms: null,
  });
}

function onEntityTypeChange(value: string | undefined): void {
  applyListUrlPatch({ entityType: value ?? null });
}

function onTestPlatformChange(value: string | undefined): void {
  applyListUrlPatch({ testPlatforms: value ?? null });
}

watch(
  () => [listQuery.value, listPaging.pagingCursor.value, listPaging.pageSize.value] as const,
  () => {
    if (permState.value === 'ready') {
      void load();
    }
  },
);

onMounted(async () => {
  if (await checkViewPermission()) {
    void load();
  }
});
</script>

<template>
  <PermissionPlaceholder
    v-if="permState === 'denied'"
    data-testid="permission-error-placeholder"
    :permission-value="t('label.view-entity', { entity: t('label.test-definition') })"
  />
  <div v-else-if="permState === 'ready'" class="test-library-page" data-testid="test-library-page">
    <div class="test-library-page__header">
      <div>
        <div class="test-library-page__title-row">
          <Typography.Title :level="4" class="test-library-page__title">
            {{ t('label.test-library') }}
          </Typography.Title>
          <LearningIcon
            page-id="testLibrary"
            :title="t('label.test-library')"
            data-testid="test-library-learning-icon"
          />
        </div>
        <Typography.Paragraph type="secondary" class="test-library-page__lead">
          {{ t('message.page-sub-header-for-test-definitions') }}
        </Typography.Paragraph>
      </div>
      <Button
        v-if="createPermission"
        type="primary"
        data-testid="create-test-definition"
        @click="openCreate"
      >
        {{ t('label.add-entity', { entity: t('label.test-definition') }) }}
      </Button>
    </div>

    <TestDefinitionFilterBar
      :search-input="searchInput"
      :entity-type="entityType"
      :test-platform="testPlatform"
      :entity-type-options="entityTypeOptions"
      :platform-options="platformOptions"
      @update:search-input="onSearchUpdate"
      @search-enter="onSearchPressEnter"
      @update:entity-type="onEntityTypeChange"
      @update:test-platform="onTestPlatformChange"
      @clear-all="clearAllFilters"
    />

    <p v-if="errorMessage" data-testid="test-library-error">{{ errorMessage }}</p>

    <NoFilteredResultsPlaceholder
      v-if="!loading && !errorMessage && definitions.length === 0 && hasActiveFilters"
      data-testid="test-library-filtered-empty"
      :on-clear-filters="clearAllFilters"
    />

    <div
      v-else
      class="test-library-table-container"
      :class="{ 'test-library-table-container--refetching': isRefetching }"
      :aria-busy="loading"
      data-testid="test-definition-table-container"
    >
      <Table
        :columns="columns"
        :data-source="definitions"
        :loading="isInitialLoading"
        :pagination="false"
        row-key="id"
        data-testid="test-definitions-table"
        @change="onTableChange"
      >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span :data-testid="`test-definition-row-${(record as TestDefinition).id}`">
            {{ (record as TestDefinition).displayName || (record as TestDefinition).name }}
          </span>
        </template>
        <template v-else-if="column.key === 'description'">
          <DescriptionCell :markdown="(record as TestDefinition).description ?? ''" />
        </template>
        <template v-else-if="column.key === 'testPlatforms'">
          {{ formatTestPlatforms((record as TestDefinition).testPlatforms) }}
        </template>
        <template v-else-if="column.key === 'enabled'">
          <Skeleton
            v-if="permissionLoading || !rowPermission((record as TestDefinition).name)"
            :paragraph="false"
            active
          />
          <Tooltip
            v-else
            :title="enabledSwitchTooltip(record as TestDefinition)"
          >
            <span>
              <Switch
                :checked="(record as TestDefinition).enabled ?? true"
                :disabled="enabledSwitchDisabled(record as TestDefinition)"
                :loading="togglingId === (record as TestDefinition).id"
                :data-testid="`enable-switch-${(record as TestDefinition).name}`"
                @change="(checked) => onEnableToggle(record as TestDefinition, Boolean(checked))"
              />
            </span>
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Skeleton
            v-if="permissionLoading || !rowPermission((record as TestDefinition).name)"
            :paragraph="false"
            active
          />
          <div v-else class="test-library-page__actions">
            <Tooltip :title="editActionTooltip(record as TestDefinition)">
              <Button
                type="text"
                size="small"
                :disabled="editActionDisabled(record as TestDefinition)"
                :data-testid="`edit-test-definition-${(record as TestDefinition).name}`"
                @click="openEdit(record as TestDefinition)"
              >
                <EditOutlined />
              </Button>
            </Tooltip>
            <Tooltip :title="deleteActionTooltip(record as TestDefinition)">
              <Button
                type="text"
                size="small"
                danger
                :disabled="deleteActionDisabled(record as TestDefinition)"
                :data-testid="`delete-test-definition-${(record as TestDefinition).name}`"
                @click="onDelete(record as TestDefinition)"
              >
                <DeleteOutlined />
              </Button>
            </Tooltip>
          </div>
        </template>
      </template>
      </Table>
    </div>

    <div class="test-library-page__pager" data-testid="test-library-pagination">
      <Button type="link" :disabled="!hasPrev" data-testid="test-library-prev" @click="onPrev">
        <LeftOutlined />
        {{ t('label.previous') }}
      </Button>
      <span data-testid="test-library-page-indicator">
        {{ t('label.page') + ' ' + listPaging.currentPage.value + ' ' + t('label.of') + ' ' + totalPages }}
      </span>
      <Button type="link" :disabled="!hasNext" data-testid="test-library-next" @click="onNext">
        {{ t('label.next') }}
        <RightOutlined />
      </Button>
      <select
        :value="listPaging.pageSize.value"
        data-testid="test-library-page-size"
        @change="onPageSizeChange(Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="size in TEST_LIBRARY_PAGE_SIZE_OPTIONS" :key="size" :value="size">
          {{ size + ' / ' + t('label.page') }}
        </option>
      </select>
    </div>

    <TestDefinitionFormDrawer
      :open="drawerOpen"
      :definition="editing"
      :saving="saving"
      :error-message="formErrorMessage"
      @update:open="(value) => { drawerOpen = value; }"
      @dismiss-error="formErrorMessage = ''"
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
.test-library-page__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.test-library-page__title {
  margin-bottom: 4px !important;
}
.test-library-page__lead {
  margin-bottom: 0 !important;
}
.test-library-table-container {
  transition: opacity 150ms;
}
.test-library-table-container--refetching {
  opacity: 0.6;
}
.test-library-page__filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.test-library-page__search {
  width: 18rem;
}
.test-library-page__pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.test-library-page__actions {
  display: flex;
  align-items: center;
}
</style>
