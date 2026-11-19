<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LearningResourcesPage: search + 4-dimension filters, table
  and card views, number-based paging over cursor walking, the 600-wide
  resource form drawer, the resource player, and permanent delete. No
  Refresh button (deletion 11.13). Link resources open in a new tab;
  every other type opens the player (the 11.8a CSV regression criterion
  is incorrect — see the implementation report).
-->
<script setup lang="ts">
import { computed, h, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  TableOutlined,
} from '@ant-design/icons-vue';
import {
  Button,
  Input,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'ant-design-vue';
import {
  deleteLearningResource,
  listLearningResources,
  type LearningResourceDetail,
} from '@/api/learningResources';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { useCursorPagedList } from '@/composables/useCursorPagedList';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { learningResourcesBreadcrumbs } from '@/settings/breadcrumbExceptions';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryDescription,
  type SettingsTranslator,
} from '@/settings/registry';
import {
  CATEGORIES,
  LEARNING_RESOURCE_STATUSES,
  MAX_VISIBLE_CONTEXTS,
  MAX_VISIBLE_TAGS,
  PAGE_IDS,
  RESOURCE_TYPE_VALUES,
  formatTableDate,
  getCategoryColor,
  getCategoryLabel,
  getContextLabel,
  openUrlInNewTab,
  opensInNewTab,
} from './learningConstants';
import LearningResourceCard from './LearningResourceCard.vue';
import LearningResourceFormDrawer from './LearningResourceFormDrawer.vue';
import LearningResourceTypeIcon from './LearningResourceTypeIcon.vue';
import ResourcePlayerModal from './ResourcePlayerModal.vue';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.learning-resources');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.learning-resources');
}
// Pin LearningResourcesPage header is the singular label.learning-resource
// (DESIGN §9.5 exception 4); the description is the registry card text.
const header = computed(() => t('settings.shell.learningResource'));
const subHeader = computed(() => registryDescription(settingsTranslator, registryEntry));
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    learningResourcesBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      t('settings.shell.learningResource'),
    ),
  ),
);

const FIELDS = 'categories,contexts,difficulty,estimatedDuration,owners';
const SEARCH_DEBOUNCE = 300;

type FilterKey = 'type' | 'category' | 'context' | 'status';
type FilterState = Partial<Record<FilterKey, string[]>>;

const searchInputValue = ref('');
const searchText = ref('');
const filterState = ref<FilterState>({});
const view = ref<'table' | 'card'>('table');

const isFormOpen = ref(false);
const isPlayerOpen = ref(false);
const isDeleteModalOpen = ref(false);
const isDeleting = ref(false);
const selectedResource = ref<LearningResourceDetail | null>(null);
const editingResource = ref<LearningResourceDetail | null>(null);
const deletingResource = ref<LearningResourceDetail | null>(null);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function onSearchInput(value: string): void {
  searchInputValue.value = value;
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchText.value = value;
  }, SEARCH_DEBOUNCE);
}
onUnmounted(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

const viewOptions = [
  { value: 'table', label: () => h(TableOutlined) },
  { value: 'card', label: () => h(AppstoreOutlined) },
];

const resetKey = computed(() => JSON.stringify({ searchText: searchText.value, filterState: filterState.value }));

const { items, paging, isLoading, page, pageSize, onPageChange, onPageSizeChange } =
  useCursorPagedList<LearningResourceDetail>(
    async ({ after, before, limit }) => {
      const result = await listLearningResources({
        limit,
        after,
        before,
        fields: FIELDS,
        search: searchText.value || undefined,
        category: filterState.value.category?.length ? filterState.value.category : undefined,
        pageId: filterState.value.context?.length ? filterState.value.context : undefined,
        resourceType: filterState.value.type?.length ? filterState.value.type : undefined,
        status: filterState.value.status?.length ? filterState.value.status : undefined,
      });
      return {
        data: result.data,
        paging: {
          total: result.total ?? 0,
          after: result.after,
          before: result.before,
        },
      };
    },
    {
      resetKey,
      onError: (error) => {
        message.error(
          error instanceof Error ? error.message : t('settings.learning.loadFailed'),
        );
      },
    },
  );

const TYPE_OPTIONS = RESOURCE_TYPE_VALUES.map((value) => ({ value, label: value }));
const CATEGORY_OPTIONS = CATEGORIES.map(({ value, label }) => ({ value, label }));
const CONTEXT_OPTIONS = PAGE_IDS.map(({ value, label }) => ({ value, label }));
const STATUS_OPTIONS = LEARNING_RESOURCE_STATUSES.map((value) => ({ value, label: value }));

const filterOptions: Record<FilterKey, { value: string; label: string }[]> = {
  type: TYPE_OPTIONS,
  category: CATEGORY_OPTIONS,
  context: CONTEXT_OPTIONS,
  status: STATUS_OPTIONS,
};
const filterLabels: Record<FilterKey, string> = {
  type: 'settings.learning.type',
  category: 'settings.learning.categories',
  context: 'settings.learning.context',
  status: 'settings.learning.status',
};

function selectedFilters(): { key: FilterKey; label: string; value: string }[] {
  const filters: { key: FilterKey; label: string; value: string }[] = [];
  const push = (key: FilterKey, resolve: (v: string) => string) => {
    const values = filterState.value[key];
    if (values?.length) {
      filters.push({
        key,
        label: t(filterLabels[key]),
        value: values.map(resolve).join(', '),
      });
    }
  };
  push('type', (v) => TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v);
  push('category', (v) => CATEGORIES.find((c) => c.value === v)?.label ?? v);
  push('context', (v) => PAGE_IDS.find((p) => p.value === v)?.label ?? v);
  push('status', (v) => v);
  return filters;
}

function setFilter(key: FilterKey, values: unknown): void {
  const selected = Array.isArray(values)
    ? values.filter((item): item is string => typeof item === 'string')
    : [];
  filterState.value = {
    ...filterState.value,
    [key]: selected.length > 0 ? selected : undefined,
  };
}

function removeFilter(key: FilterKey): void {
  filterState.value = { ...filterState.value, [key]: undefined };
}

function clearAllFilters(): void {
  filterState.value = {
    type: undefined,
    category: undefined,
    context: undefined,
    status: undefined,
  };
}

const columns = computed(() => [
  { title: t('settings.learning.contentName'), dataIndex: 'name', key: 'name', width: 360 },
  { title: t('settings.learning.categories'), key: 'categories', width: 220 },
  { title: t('settings.learning.context'), key: 'context', width: 220 },
  { title: t('settings.learning.updatedAt'), key: 'updated', width: 140 },
  { title: t('settings.learning.actions'), key: 'actions', width: 100 },
]);

function handleCreate(): void {
  editingResource.value = null;
  isFormOpen.value = true;
}

function handleEdit(resource: LearningResourceDetail): void {
  editingResource.value = resource;
  isFormOpen.value = true;
}

function handleDelete(resource: LearningResourceDetail): void {
  deletingResource.value = resource;
  isDeleteModalOpen.value = true;
}

async function handleDeleteConfirm(): Promise<void> {
  if (!deletingResource.value) {
    return;
  }
  isDeleting.value = true;
  try {
    await deleteLearningResource(deletingResource.value.id, true);
    message.success(t('settings.learning.deleted'));
    isDeleteModalOpen.value = false;
    deletingResource.value = null;
    await onPageChange(page.value);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.learning.deleteFailed'));
  } finally {
    isDeleting.value = false;
  }
}

function handleDeleteCancel(): void {
  isDeleteModalOpen.value = false;
  deletingResource.value = null;
}

function handlePreview(resource: LearningResourceDetail): void {
  if (opensInNewTab(resource.resourceType)) {
    openUrlInNewTab(resource.source.url);
    return;
  }
  selectedResource.value = resource;
  isPlayerOpen.value = true;
}

// The official form close refetches unconditionally, even on cancel.
function handleFormClose(): void {
  isFormOpen.value = false;
  editingResource.value = null;
  void onPageChange(page.value);
}

function handlePlayerClose(): void {
  isPlayerOpen.value = false;
  selectedResource.value = null;
}
</script>

<template>
  <div data-testid="learning-resources">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="learning-resources"
    />
    <div data-testid="learning-resources-page">
      <div class="learning-header-card">
        <div>
          <Typography.Title :level="4" style="margin: 0">
            {{ t('settings.learning.resource') }}
          </Typography.Title>
          <Typography.Text type="secondary">
            {{ t('settings.learning.managementDescription') }}
          </Typography.Text>
        </div>
        <Button type="primary" data-testid="create-resource" @click="handleCreate">
          <PlusOutlined />
          {{ t('settings.learning.addResource') }}
        </Button>
      </div>

      <div class="learning-toolbar">
        <Input
          :value="searchInputValue"
          :placeholder="t('settings.learning.searchPlaceholder')"
          class="learning-search"
          data-testid="learning-search"
          @update:value="onSearchInput"
        />
        <Select
          :value="filterState.type ?? []"
          mode="multiple"
          show-search
          :placeholder="t('settings.learning.type')"
          :options="filterOptions.type"
          class="learning-filter"
          data-testid="filter-type"
          @update:value="setFilter('type', $event)"
        />
        <Select
          :value="filterState.category ?? []"
          mode="multiple"
          show-search
          :placeholder="t('settings.learning.categories')"
          :options="filterOptions.category"
          class="learning-filter"
          data-testid="filter-category"
          @update:value="setFilter('category', $event)"
        />
        <Select
          :value="filterState.context ?? []"
          mode="multiple"
          show-search
          :placeholder="t('settings.learning.context')"
          :options="filterOptions.context"
          class="learning-filter"
          data-testid="filter-context"
          @update:value="setFilter('context', $event)"
        />
        <Select
          :value="filterState.status ?? []"
          mode="multiple"
          show-search
          :placeholder="t('settings.learning.status')"
          :options="filterOptions.status"
          class="learning-filter"
          data-testid="filter-status"
          @update:value="setFilter('status', $event)"
        />
        <div class="learning-toolbar__spacer" />
        <Segmented
          :value="view"
          :options="viewOptions"
          @update:value="view = $event as 'table' | 'card'"
        />
      </div>

      <div v-if="selectedFilters().length > 0" class="learning-filter-chips">
        <div class="learning-filter-chips__list">
          <Tag
            v-for="filter in selectedFilters()"
            :key="filter.key"
            color="blue"
            closable
            @close="removeFilter(filter.key)"
          >
            <span :data-testid="`filter-chip-${filter.key}`">
              {{ filter.label }}: {{ filter.value }}
            </span>
          </Tag>
        </div>
        <Button type="link" @click="clearAllFilters">
          {{ t('settings.learning.clearAll') }}
        </Button>
      </div>

      <template v-if="view === 'table'">
        <Skeleton v-if="isLoading" active :paragraph="{ rows: 6 }" />
        <div v-else-if="items.length === 0" class="learning-empty">
          <Typography.Text type="secondary">
            {{ t('settings.learning.noRecordsFound') }}
          </Typography.Text>
        </div>
        <SmTable
          v-else
          row-key="id"
          :columns="columns"
          :data-source="items"
          :pagination="false"
          test-id="learning-resources-table-body"
          :custom-row="(record: unknown) => ({ onClick: () => handlePreview(record as LearningResourceDetail), 'data-testid': (record as LearningResourceDetail).name })"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <div class="learning-name-cell">
                <LearningResourceTypeIcon
                  :resource-type="(record as LearningResourceDetail).resourceType"
                />
                <Typography.Text ellipsis :title="(record as LearningResourceDetail).displayName || (record as LearningResourceDetail).name">
                  {{ (record as LearningResourceDetail).displayName || (record as LearningResourceDetail).name }}
                </Typography.Text>
              </div>
            </template>
            <template v-else-if="column.key === 'categories'">
              <Space :size="4">
                <Tag
                  v-for="category in ((record as LearningResourceDetail).categories ?? []).slice(0, MAX_VISIBLE_TAGS)"
                  :key="category"
                  :color="getCategoryColor(category)"
                >
                  {{ getCategoryLabel(category) }}
                </Tag>
                <Tag
                  v-if="((record as LearningResourceDetail).categories ?? []).length - MAX_VISIBLE_TAGS > 0"
                  color="blue"
                >
                  +{{ ((record as LearningResourceDetail).categories ?? []).length - MAX_VISIBLE_TAGS }}
                </Tag>
              </Space>
            </template>
            <template v-else-if="column.key === 'context'">
              <Space :size="4">
                <Tag
                  v-for="ctx in ((record as LearningResourceDetail).contexts ?? []).slice(0, MAX_VISIBLE_CONTEXTS)"
                  :key="ctx.pageId"
                  color="default"
                >
                  {{ getContextLabel(ctx.pageId) }}
                </Tag>
                <Tag
                  v-if="((record as LearningResourceDetail).contexts ?? []).length - MAX_VISIBLE_CONTEXTS > 0"
                  color="default"
                >
                  +{{ ((record as LearningResourceDetail).contexts ?? []).length - MAX_VISIBLE_CONTEXTS }}
                </Tag>
              </Space>
            </template>
            <template v-else-if="column.key === 'updated'">
              <Typography.Text type="secondary">
                {{ formatTableDate((record as LearningResourceDetail).updatedAt) ?? '-' }}
              </Typography.Text>
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space>
                <Tooltip :title="t('settings.learning.edit')">
                  <Button
                    size="small"
                    :aria-label="t('settings.learning.edit')"
                    :data-testid="`edit-${(record as LearningResourceDetail).name}`"
                    @click.stop="handleEdit(record as LearningResourceDetail)"
                  >
                    <EditOutlined />
                  </Button>
                </Tooltip>
                <Tooltip :title="t('settings.learning.delete')">
                  <Button
                    size="small"
                    :aria-label="t('settings.learning.delete')"
                    :data-testid="`delete-${(record as LearningResourceDetail).name}`"
                    @click.stop="handleDelete(record as LearningResourceDetail)"
                  >
                    <DeleteOutlined />
                  </Button>
                </Tooltip>
              </Space>
            </template>
          </template>
        </SmTable>
      </template>
      <template v-else>
        <Skeleton v-if="isLoading" active :paragraph="{ rows: 6 }" />
        <div v-else class="learning-card-grid">
          <LearningResourceCard
            v-for="resource in items"
            :key="resource.id"
            :resource="resource"
            @click="handlePreview"
          />
        </div>
      </template>

      <div class="learning-pagination">
        <NextPrevious
          :paging="paging"
          :paging-handler="({ currentPage }) => onPageChange(currentPage)"
          :page-size="pageSize"
          :current-page="page"
          :is-number-based="true"
          :is-loading="isLoading"
          :page-size-options="[15, 25, 50]"
          :on-show-size-change="onPageSizeChange"
        />
      </div>
    </div>

    <LearningResourceFormDrawer
      :open="isFormOpen"
      :resource="editingResource"
      @close="handleFormClose"
    />

    <ResourcePlayerModal
      v-if="isPlayerOpen && selectedResource"
      :open="isPlayerOpen"
      :resource="selectedResource"
      @close="handlePlayerClose"
    />

    <Modal
      :open="isDeleteModalOpen"
      :title="`${t('settings.learning.delete')} ${deletingResource?.displayName || deletingResource?.name || ''}`"
      :confirm-loading="isDeleting"
      :ok-text="t('settings.learning.delete')"
      ok-type="danger"
      @cancel="handleDeleteCancel"
      @ok="handleDeleteConfirm"
    >
      <p>{{ t('settings.learning.deletePermanently') }}</p>
    </Modal>
  </div>
</template>

<style scoped>
.learning-header-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  margin-bottom: 10px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
}

.learning-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px;
}

.learning-search {
  max-width: 344px;
}

.learning-filter {
  min-width: 140px;
}

.learning-toolbar__spacer {
  flex: 1;
}

.learning-filter-chips {
  display: flex;
  align-items: center;
  padding: 0 12px 12px;
}

.learning-filter-chips__list {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 8px;
}

.learning-empty {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.learning-name-cell {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.learning-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 12px;
}

.learning-pagination {
  display: flex;
  justify-content: center;
  padding: 8px;
  border-top: 1px solid var(--sm-border-color);
}
</style>
