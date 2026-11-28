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
import { getDerivedPermissionFlags } from '@/api/permissions';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { Button, Input, Modal, Switch, Table, Typography, message } from 'ant-design-vue';
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
import {
  TEST_LIBRARY_ENTITY_TYPES,
  TEST_LIBRARY_PAGE_SIZE,
  TEST_LIBRARY_PAGE_SIZE_OPTIONS,
  TEST_LIBRARY_PLATFORMS,
  formatTestPlatforms,
  testLibraryEntityTypeLabel,
  isEnabledToggleDisabled,
  isSystemTestDefinition,
  pageCount,
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
const definitions = ref<TestDefinition[]>([]);
const total = ref(0);
const pageAfter = ref<string | undefined>();
const pageBefore = ref<string | undefined>();
const cursorAfter = ref<string | undefined>();
const cursorBefore = ref<string | undefined>();
const currentPage = ref(1);
const pageSize = ref(TEST_LIBRARY_PAGE_SIZE);
const searchInput = ref('');

const listQuery = computed(() =>
  parseTestDefinitionListQuery(route.query as Record<string, unknown>),
);
const entityType = computed(() => listQuery.value.entityType);
const testPlatform = computed(() => listQuery.value.testPlatform);
/** Official useListSearchInput SEARCH_DEBOUNCE_MS. */
const SEARCH_DEBOUNCE_MS = 300;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
const drawerOpen = ref(false);
const editing = ref<TestDefinition | undefined>();
const saving = ref(false);
const togglingId = ref<string | undefined>();

const entityTypeOptions = computed(() =>
  TEST_LIBRARY_ENTITY_TYPES.map((key) => ({
    key,
    label: testLibraryEntityTypeLabel(key, t),
  })),
);
const platformOptions = computed(() =>
  TEST_LIBRARY_PLATFORMS.map((key) => ({ key, label: key })),
);

const columns = computed(() => [
  { title: t('label.name'), dataIndex: 'name', key: 'name' },
  { title: t('label.description'), dataIndex: 'description', key: 'description' },
  { title: t('label.entity-type'), dataIndex: 'entityType', key: 'entityType', width: 120 },
  { title: t('label.test-platform-plural'), key: 'testPlatforms', width: 180 },
  { title: t('label.enabled'), key: 'enabled', width: 90 },
  { title: t('label.action-plural'), key: 'actions', width: 90 },
]);

const totalPages = computed(() => pageCount(total.value, pageSize.value));
const hasPrev = computed(() => currentPage.value > 1);
const hasNext = computed(() => currentPage.value < totalPages.value || Boolean(pageAfter.value));

function resetPagingState(): void {
  currentPage.value = 1;
  cursorAfter.value = undefined;
  cursorBefore.value = undefined;
}

function applyListUrlPatch(
  patch: Record<string, string | number | boolean | string[] | null | undefined>,
): void {
  resetPagingState();
  void router.replace({
    query: mergeTestDefinitionListQuery(route.query as Record<string, unknown>, patch),
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
  loading.value = true;
  errorMessage.value = '';
  try {
    const query = listQuery.value;
    const page = await listTestDefinitions({
      limit: pageSize.value,
      after: cursorBefore.value ? undefined : cursorAfter.value,
      before: cursorBefore.value,
      entityType: query.entityType,
      testPlatform: query.testPlatform,
      q: query.q.trim() || undefined,
      sortField: query.sortField,
      sortOrder: query.sortOrder,
    });
    definitions.value = page.data;
    total.value = page.total ?? page.data.length;
    pageAfter.value = page.after;
    pageBefore.value = page.before;
  } catch (error) {
    definitions.value = [];
    errorMessage.value = getErrorText(error, t('server.unexpected-error'));
  } finally {
    loading.value = false;
  }
}

function resetAndLoad(): void {
  resetPagingState();
  void load();
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
      message.success(t('server.update-entity-success', { entity: t('label.test-definition') }));
    } else if (editing.value) {
      await updateTestDefinition({ ...toCreateTestDefinitionRequest(values), name: editing.value.name });
      message.success(t('server.update-entity-success', { entity: t('label.test-definition') }));
    } else {
      const created = await createTestDefinition(toCreateTestDefinitionRequest(values));
      message.success(t('server.create-entity-success', { entity: t('label.test-definition') }));
    }
    drawerOpen.value = false;
    Object.assign(values, createEmptyTestDefinitionForm());
    await load();
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : t(
            editing.value ? 'server.update-entity-error' : 'server.create-entity-error',
            { entity: t('label.test-definition') },
          ),
    );
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
  () => route.query,
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
        <Typography.Title :level="4" class="test-library-page__title">
          {{ t('label.test-library') }}
        </Typography.Title>
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
        {{ t('label.previous') }}
      </Button>
      <span data-testid="test-library-page-indicator">
        {{ t('label.page') + ' ' + currentPage + ' ' + t('label.of') + ' ' + totalPages }}
      </span>
      <Button type="link" :disabled="!hasNext" data-testid="test-library-next" @click="onNext">
        {{ t('label.next') }}
        <RightOutlined />
      </Button>
      <select
        :value="pageSize"
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
</style>
