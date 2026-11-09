<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Menu, Select, Switch, Tabs, Tag, Typography, message } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { EntityListColumn } from '@/features/crud/types';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import AsyncEntitySelect, {
  type AsyncSelectOption,
} from '@/components/shared/AsyncEntitySelect.vue';
import {
  createContextMemory,
  deleteContextMemory,
  listContextMemories,
  pinContextMemory,
  unpinContextMemory,
  updateContextMemory,
} from '@/api/contextCenter';
import { permissionFlags } from '@/api/permissions';
import { searchAssets } from '@/api/search';
import { listMyAssignedTasks, listTasks } from '@/api/tasks';
import { searchUsers } from '@/api/users';
import {
  DEFAULT_MEMORY_LIST_STATUSES,
  MEMORY_FIELDS,
  MEMORY_PAGE_SIZE,
  MEMORY_STATUSES,
  buildMemoryUpdatePatch,
  getMemoryCitations,
  getMemoryLinkedEntities,
  getSortConfig,
  memoryDeepLink,
  type MemoryCreateInput,
  type MemoryEditInput,
  type MemorySortBy,
} from '@/catalog/contextCenterMemories';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type { CollaborationTask } from '@/types/collaboration';
import type { ContextMemory } from '@/types/contextCenter';
import ContextCenterNav from './ContextCenterNav.vue';
import MemoryConflictCompareModal from './MemoryConflictCompareModal.vue';
import MemoryConflictReviews from './MemoryConflictReviews.vue';
import MemoryFormModal from './MemoryFormModal.vue';
import { formatEpoch, formatRelativeTime } from './time';

const { t } = useI18n();
const auth = useAuthStore();
const permissionStore = usePermissionStore();

/**
 * ADR:2026-11-07-context-center-permission-gates — create is hidden
 * without contextMemory Create; pin/unpin (an edit-class mutation; the
 * official pin has no rendered entry to copy a gate from) is hidden
 * without EditAll; row delete additionally needs owner-or-admin. A
 * failed permission request leaves all three false (fail-closed).
 */
const canCreate = ref(false);
const canEditAll = ref(false);
const canDelete = ref(false);

async function loadPermissions(): Promise<void> {
  try {
    const flags = permissionFlags(
      await permissionStore.getResourcePermission('contextMemory'),
    );
    canCreate.value = flags.canCreate;
    canEditAll.value = flags.canEditAll;
    canDelete.value = flags.canDelete;
  } catch {
    canCreate.value = false;
    canEditAll.value = false;
    canDelete.value = false;
  }
}

function isMemoryOwner(memory: ContextMemory): boolean {
  const user = auth.user;
  if (!user) {
    return false;
  }
  return (memory.owners ?? []).some(
    (owner) =>
      (owner.name !== undefined && owner.name !== '' && owner.name === user.name) ||
      (owner.id !== undefined && owner.id !== '' && owner.id === user.id),
  );
}

function canDeleteMemory(memory: ContextMemory): boolean {
  return canDelete.value && (isMemoryOwner(memory) || permissionStore.isAdminUser);
}

function canEditMemory(memory: ContextMemory): boolean {
  return canEditAll.value && (isMemoryOwner(memory) || permissionStore.isAdminUser);
}

function rowCanDeleteMemory(record: unknown): boolean {
  return canDeleteMemory(record as ContextMemory);
}

type MemoryFilterTab = 'all' | 'created-by-me' | 'needs-review';

const loading = ref(false);
const errorMessage = ref('');
const memories = ref<ContextMemory[]>([]);
const total = ref<number | undefined>();
const currentPage = ref(1);
const activeFilter = ref<MemoryFilterTab>('all');
const selectedStatuses = ref<string[]>([...DEFAULT_MEMORY_LIST_STATUSES]);
const previousStatuses = ref<string[]>([...DEFAULT_MEMORY_LIST_STATUSES]);
const pinnedOnly = ref(false);
const sortBy = ref<MemorySortBy>('updated');
const searchText = ref('');
const debouncedSearch = ref('');
const selectedAuthorId = ref<string | null>(null);
const selectedAuthorOption = ref<AsyncSelectOption | null>(null);
const selectedAssetId = ref<string | null>(null);
const selectedAssetOption = ref<AsyncSelectOption | null>(null);
const counts = ref({ totalVisible: 0, createdByMeVisible: 0, reviewTotal: 0 });
const showCreateModal = ref(false);
const memoryToEdit = ref<ContextMemory | null>(null);
const previewMemory = ref<ContextMemory | null>(null);
const activeReview = ref<CollaborationTask | null>(null);
const showCompare = ref(false);
const reviewRefreshSignal = ref(0);

const isReviewing = computed(() => activeFilter.value === 'needs-review');
const offset = computed(() => (currentPage.value - 1) * MEMORY_PAGE_SIZE);
const hasNext = computed(
  () => total.value !== undefined && offset.value + memories.value.length < total.value,
);
const hasPrev = computed(() => currentPage.value > 1);

const statusOptions = computed(() =>
  MEMORY_STATUSES.map((value) => ({
    value,
    label: t(`contextCenter.status${value}`),
  })),
);

const authorSeedOptions = computed<AsyncSelectOption[]>(() =>
  selectedAuthorOption.value ? [selectedAuthorOption.value] : [],
);
const assetSeedOptions = computed<AsyncSelectOption[]>(() =>
  selectedAssetOption.value ? [selectedAssetOption.value] : [],
);

let listGeneration = 0;
let countGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function load(): Promise<void> {
  if (isReviewing.value) {
    return;
  }
  const request = ++listGeneration;
  loading.value = true;
  errorMessage.value = '';
  try {
    const sortConfig = getSortConfig(sortBy.value);
    const authorFilter =
      activeFilter.value === 'created-by-me'
        ? (auth.user?.id ?? auth.user?.name)
        : (selectedAuthorId.value ?? undefined);
    const result = await listContextMemories({
      limit: MEMORY_PAGE_SIZE,
      offset: offset.value,
      fields: MEMORY_FIELDS,
      q: debouncedSearch.value.trim() || undefined,
      assets: selectedAssetId.value ?? undefined,
      author: authorFilter,
      pinned: pinnedOnly.value ? true : undefined,
      sortBy: sortConfig.sortBy,
      sortOrder: sortConfig.sortOrder,
      statuses: selectedStatuses.value.join(',') || undefined,
    });
    if (request !== listGeneration) {
      return;
    }
    memories.value = result.data;
    total.value = result.total;
  } catch (error) {
    if (request !== listGeneration) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    memories.value = [];
    total.value = undefined;
  } finally {
    if (request === listGeneration) {
      loading.value = false;
    }
  }
}

/**
 * ADR:2026-11-08-context-center-memories-offset-pagination — counts are
 * three parallel limit:0 reads (total / created-by-me / open reviews);
 * the pinned count is a stub 0 and no pinned card is built (C-D8).
 */
async function loadCounts(): Promise<void> {
  const request = ++countGeneration;
  try {
    const statusFilter = selectedStatuses.value.join(',');
    const authorFilter = auth.user?.id ?? auth.user?.name;
    const [totalPage, minePage, reviewPage] = await Promise.all([
      listContextMemories({ limit: 0, offset: 0, statuses: statusFilter }),
      authorFilter
        ? listContextMemories({ limit: 0, offset: 0, statuses: statusFilter, author: authorFilter })
        : Promise.resolve({ data: [], total: 0 }),
      (permissionStore.isAdminUser ? listTasks : listMyAssignedTasks)({
        type: 'MemoryConflictReview',
        status: 'Open',
        limit: 1,
      }),
    ]);
    if (request !== countGeneration) {
      return;
    }
    counts.value = {
      totalVisible: totalPage.total ?? 0,
      createdByMeVisible: minePage.total ?? 0,
      reviewTotal: reviewPage.total ?? 0,
    };
  } catch {
    // Counts are best-effort; the list load reports failures.
  }
}

function resetToFirstPage(): void {
  currentPage.value = 1;
}

function onFilterChange(tab: string | number): void {
  const next = tab as MemoryFilterTab;
  if (next === activeFilter.value) {
    return;
  }
  activeFilter.value = next;
  if (next === 'all') {
    selectedAuthorId.value = null;
    selectedAuthorOption.value = null;
    selectedAssetId.value = null;
    selectedAssetOption.value = null;
  }
  resetToFirstPage();
  void load();
}

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or array);
 * this multiple select only ever carries plain string values, so normalise
 * to string[] here and keep the rest of the handler in string terms.
 */
function onStatusChange(values: SelectValue): void {
  const next = (values === undefined ? [] : Array.isArray(values) ? values : [values]).map(
    (value) => (typeof value === 'object' && value !== null ? String(value.value) : String(value)),
  );
  if (next.length === 0) {
    // Official handleStatusChange: at least one status stays selected.
    selectedStatuses.value = [...previousStatuses.value];
    return;
  }
  selectedStatuses.value = MEMORY_STATUSES.filter((status) => next.includes(status));
  previousStatuses.value = [...selectedStatuses.value];
  resetToFirstPage();
  void load();
  void loadCounts();
}

function applySearch(): void {
  resetToFirstPage();
  void load();
}

function onSearchInput(value: string): void {
  searchText.value = value;
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    debouncedSearch.value = value;
    applySearch();
  }, 300);
}

function onSearchEnter(): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  debouncedSearch.value = searchText.value;
  applySearch();
}

async function fetchAuthorOptions(term: string): Promise<AsyncSelectOption[]> {
  const page = await searchUsers(term, 0, 25);
  return page.data.map((user) => ({
    value: user.id,
    label: user.displayName || user.name,
  }));
}

async function fetchAssetOptions(term: string): Promise<AsyncSelectOption[]> {
  const page = await searchAssets(term, 0, 25);
  return page.hits.flatMap((hit) =>
    hit.id ? [{ value: hit.id, label: hit.displayName || hit.name || hit.fullyQualifiedName }] : [],
  );
}

function onAuthorChange(value: string | string[] | null): void {
  const id = Array.isArray(value) ? value[0] : value;
  selectedAuthorId.value = id ?? null;
  selectedAuthorOption.value =
    id !== undefined && id !== null
      ? (authorSeedOptions.value.find((option) => option.value === id) ??
        selectedAuthorOption.value)
      : null;
  // Selecting an author clears the created-by-me tab (official: filter '').
  if (id && activeFilter.value === 'created-by-me') {
    activeFilter.value = 'all';
  }
  resetToFirstPage();
  void load();
}

function onAssetChange(value: string | string[] | null): void {
  const id = Array.isArray(value) ? value[0] : value;
  selectedAssetId.value = id ?? null;
  selectedAssetOption.value =
    id !== undefined && id !== null
      ? (assetSeedOptions.value.find((option) => option.value === id) ??
        selectedAssetOption.value)
      : null;
  resetToFirstPage();
  void load();
}

const columns = computed<EntityListColumn[]>(() => [
  { title: t('contextCenter.question'), dataIndex: 'question', key: 'question' },
  { title: t('contextCenter.citations'), dataIndex: 'citations', key: 'citations' },
  { title: t('contextCenter.linkedAssets'), dataIndex: 'linkedAssets', key: 'linkedAssets' },
  { title: t('contextCenter.status'), dataIndex: 'entityStatus', key: 'entityStatus' },
  { title: t('contextCenter.pinned'), dataIndex: 'pinnedLabel', key: 'pinnedLabel' },
  { title: t('contextCenter.updatedBy'), dataIndex: 'updatedBy', key: 'updatedBy' },
  { title: t('contextCenter.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
]);

function citationText(memory: ContextMemory): string {
  const { count, lastAt } = getMemoryCitations(memory);
  if (count === undefined && lastAt === undefined) {
    return '';
  }
  const cited = count === undefined ? '' : t('contextCenter.citedNTimes', { count });
  const last = lastAt ? t('contextCenter.lastCited', { date: formatRelativeTime(lastAt) }) : '';
  return [cited, last].filter(Boolean).join(' · ');
}

function openEdit(memory: ContextMemory): void {
  if (!canEditMemory(memory)) {
    return;
  }
  memoryToEdit.value = memory;
  showCreateModal.value = true;
}

async function onCreate(input: MemoryCreateInput): Promise<void> {
  try {
    await createContextMemory(input);
    showCreateModal.value = false;
    message.success(t('contextCenter.created'));
    resetToFirstPage();
    void load();
    void loadCounts();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onSaveEdit({ id, input }: { id: string; input: MemoryEditInput }): Promise<void> {
  const editing = memoryToEdit.value;
  if (!editing || editing.id !== id) {
    return;
  }
  try {
    const patch = buildMemoryUpdatePatch(editing, input);
    if (patch.length > 0) {
      await updateContextMemory(id, patch);
    }
    showCreateModal.value = false;
    memoryToEdit.value = null;
    message.success(t('contextCenter.saved'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onModalDelete(id: string): Promise<void> {
  try {
    // ADR:2026-11-08-context-center-memory-create-edit-payload — the edit
    // modal deletes soft (no hardDelete), unlike the list row.
    await deleteContextMemory(id);
    showCreateModal.value = false;
    memoryToEdit.value = null;
    message.success(t('contextCenter.deleted'));
    void load();
    void loadCounts();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onTogglePin(memory: ContextMemory): Promise<void> {
  try {
    if (memory.pinned) {
      await unpinContextMemory(memory.id);
      message.success(t('contextCenter.unpinned'));
    } else {
      await pinContextMemory(memory.id);
      message.success(t('contextCenter.pinned'));
    }
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onDelete(memory: ContextMemory): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('contextCenter.deleteMemory'),
    content: memory.question || memory.displayName || memory.id,
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteContextMemory(memory.id, true);
    message.success(t('contextCenter.deleted'));
    void load();
    void loadCounts();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function copyLink(memory: ContextMemory): Promise<void> {
  const url = memoryDeepLink(window.location.origin, window.location.pathname, memory.name);
  try {
    await navigator.clipboard.writeText(url);
    message.success(t('contextCenter.linkCopied'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

function openReview(task: CollaborationTask): void {
  activeReview.value = task;
  showCompare.value = true;
}

function onReviewResolved(): void {
  showCompare.value = false;
  activeReview.value = null;
  reviewRefreshSignal.value += 1;
  void loadCounts();
}

onMounted(() => {
  void load();
  void loadCounts();
  void loadPermissions();
});
</script>

<template>
  <div data-testid="context-center-memories" data-tour-step="memories" data-tour-page>
    <ContextCenterNav />
    <Tabs
      :active-key="activeFilter"
      data-testid="memories-filter-tabs"
      @change="onFilterChange"
    >
      <Tabs.TabPane
        key="all"
        :tab="`${t('contextCenter.allMemories')} (${counts.totalVisible})`"
      />
      <Tabs.TabPane
        key="created-by-me"
        :tab="`${t('contextCenter.createdByMe')} (${counts.createdByMeVisible})`"
      />
      <Tabs.TabPane
        key="needs-review"
        :tab="`${t('contextCenter.needsReview')} (${counts.reviewTotal})`"
      />
    </Tabs>
    <MemoryConflictReviews
      v-if="isReviewing"
      :refresh-signal="reviewRefreshSignal"
      @open-review="openReview"
      @count="counts.reviewTotal = $event"
    />
    <EntityListShell
      v-else
      :title="t('contextCenter.memories')"
      :lead="t('contextCenter.memoriesLead')"
      :loading="loading"
      :error="errorMessage"
      :columns="columns"
      :data-source="
        memories.map((memory) => ({
          ...memory,
          question: memory.title || memory.question || memory.displayName || '',
          citations: citationText(memory),
          pinnedLabel: memory.pinned ? t('contextCenter.yes') : '',
          updatedAt: formatEpoch(memory.updatedAt),
        }))
      "
      row-key="id"
      table-test-id="memories-table"
      :total="total"
      :has-next="hasNext"
      :has-prev="hasPrev"
      :empty-text="t('contextCenter.emptyMemories')"
      show-search
      :search-value="searchText"
      :search-placeholder="t('contextCenter.searchMemoriesPlaceholder')"
      show-row-actions
      :show-delete-action="canDelete"
      :row-can-delete="rowCanDeleteMemory"
      @refresh="load()"
      @next="currentPage += 1; load()"
      @prev="currentPage -= 1; load()"
      @view="previewMemory = $event as ContextMemory"
      @delete="onDelete($event as ContextMemory)"
      @update:search-value="onSearchInput"
      @search="onSearchEnter"
    >
      <template #actions>
        <Button
          v-if="canCreate"
          type="primary"
          data-testid="memories-create"
          @click="memoryToEdit = null; showCreateModal = true"
        >
          {{ t('contextCenter.createMemory') }}
        </Button>
      </template>
      <template #filters>
        <Select
          :value="selectedStatuses"
          mode="multiple"
          style="min-width: 220px"
          data-testid="memories-status-filter"
          :options="statusOptions"
          @change="onStatusChange"
        />
        <span>
          {{ t('contextCenter.pinnedOnly') }}
          <Switch
            v-model:checked="pinnedOnly"
            data-testid="memories-pinned-filter"
            @change="resetToFirstPage(); load()"
          />
        </span>
        <Select
          v-model:value="sortBy"
          style="min-width: 160px"
          data-testid="memories-sort"
          :options="[
            { value: 'updated', label: t('contextCenter.sortUpdatedAt') },
            { value: 'usage', label: t('contextCenter.sortUsage') },
            { value: 'updatedBy', label: t('contextCenter.sortUpdatedBy') },
          ]"
          @change="resetToFirstPage(); load()"
        />
        <span style="display: inline-block; min-width: 200px">
          <AsyncEntitySelect
            :model-value="selectedAuthorId"
            :fetch-options="fetchAuthorOptions"
            :seed-options="authorSeedOptions"
            test-id="memories-author-filter"
            :placeholder="t('contextCenter.searchAuthorPlaceholder')"
            @update:model-value="onAuthorChange"
          />
        </span>
        <span style="display: inline-block; min-width: 200px">
          <AsyncEntitySelect
            :model-value="selectedAssetId"
            :fetch-options="fetchAssetOptions"
            :seed-options="assetSeedOptions"
            test-id="memories-asset-filter"
            :placeholder="t('contextCenter.searchAssetPlaceholder')"
            @update:model-value="onAssetChange"
          />
        </span>
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'pinnedLabel'">
          <Button
            v-if="canEditAll"
            type="link"
            :data-testid="`memory-pin-${(record as ContextMemory).id}`"
            @click="onTogglePin(record as ContextMemory)"
          >
            {{
              (record as ContextMemory).pinned
                ? t('contextCenter.unpin')
                : t('contextCenter.pin')
            }}
          </Button>
        </template>
        <template v-else-if="column.key === 'linkedAssets'">
          <span
            v-for="entity in getMemoryLinkedEntities(record as ContextMemory).visible"
            :key="entity.id ?? entity.fullyQualifiedName"
            style="margin-right: 4px"
          >
            <Tag>{{ entity.displayName || entity.name }}</Tag>
          </span>
          <Tag
            v-if="getMemoryLinkedEntities(record as ContextMemory).hiddenCount > 0"
          >
            {{
              t('contextCenter.plusCount', {
                count: getMemoryLinkedEntities(record as ContextMemory).hiddenCount,
              })
            }}
          </Tag>
        </template>
        <template v-else>
          {{ (record as Record<string, unknown>)[String(column.dataIndex ?? '')] }}
        </template>
      </template>
      <template #rowActions="{ record }">
        <Menu.Item
          v-if="canEditMemory(record as ContextMemory)"
          key="edit-memory"
          :data-testid="`memory-edit-${(record as ContextMemory).id}`"
          @click="openEdit(record as ContextMemory)"
        >
          {{ t('crud.edit') }}
        </Menu.Item>
        <Menu.Item
          key="copy-link"
          :data-testid="`memory-copy-link-${(record as ContextMemory).id}`"
          @click="copyLink(record as ContextMemory)"
        >
          {{ t('contextCenter.copyLink') }}
        </Menu.Item>
      </template>
    </EntityListShell>
    <SmDrawer
      :open="!!previewMemory"
      :title="previewMemory?.title || previewMemory?.question || previewMemory?.displayName || ''"
      :show-ok="false"
      test-id="memory-preview-drawer"
      @cancel="previewMemory = null"
      @update:open="previewMemory = $event ? previewMemory : null"
    >
      <div v-if="previewMemory">
        <Typography.Paragraph>
          {{ t('contextCenter.question') }}: {{ previewMemory.question || '' }}
        </Typography.Paragraph>
        <Typography.Paragraph v-if="previewMemory.answer">
          {{ t('contextCenter.answer') }}: {{ previewMemory.answer }}
        </Typography.Paragraph>
        <Typography.Paragraph v-if="previewMemory.description">
          {{ t('contextCenter.description') }}: {{ previewMemory.description }}
        </Typography.Paragraph>
        <p>
          {{ t('contextCenter.status') }}: {{ previewMemory.entityStatus || '' }} ·
          {{ t('contextCenter.updatedBy') }}: {{ previewMemory.updatedBy || '' }}
          {{ formatEpoch(previewMemory.updatedAt) }}
        </p>
        <Typography.Paragraph
          v-if="citationText(previewMemory)"
          data-testid="memory-preview-citations"
        >
          {{ citationText(previewMemory) }}
        </Typography.Paragraph>
        <Typography.Paragraph
          v-if="
            (previewMemory.outcomes?.positiveCount ?? 0) > 0 ||
            (previewMemory.outcomes?.negativeCount ?? 0) > 0 ||
            (previewMemory.outcomes?.correctedCount ?? 0) > 0
          "
          data-testid="memory-preview-outcomes"
        >
          <span
            v-if="(previewMemory.outcomes?.positiveCount ?? 0) > 0"
            data-testid="memory-helpful-count"
          >
            {{ t('contextCenter.helpfulCount', { count: previewMemory.outcomes?.positiveCount }) }}
          </span>
          <span
            v-if="(previewMemory.outcomes?.negativeCount ?? 0) > 0"
            data-testid="memory-unhelpful-count"
          >
            {{ t('contextCenter.unhelpfulCount', { count: previewMemory.outcomes?.negativeCount }) }}
          </span>
          <span
            v-if="(previewMemory.outcomes?.correctedCount ?? 0) > 0"
            data-testid="memory-corrected-count"
          >
            {{ t('contextCenter.correctedCount', { count: previewMemory.outcomes?.correctedCount }) }}
          </span>
        </Typography.Paragraph>
        <p v-if="getMemoryLinkedEntities(previewMemory).visible.length > 0">
          <Tag
            v-for="entity in getMemoryLinkedEntities(previewMemory).visible"
            :key="entity.id ?? entity.fullyQualifiedName"
          >
            {{ entity.displayName || entity.name }}
          </Tag>
          <Tag v-if="getMemoryLinkedEntities(previewMemory).hiddenCount > 0">
            {{
              t('contextCenter.plusCount', {
                count: getMemoryLinkedEntities(previewMemory).hiddenCount,
              })
            }}
          </Tag>
        </p>
        <Button data-testid="memory-preview-copy-link" @click="copyLink(previewMemory)">
          {{ t('contextCenter.copyLink') }}
        </Button>
        <Button
          v-if="canEditMemory(previewMemory)"
          data-testid="memory-preview-edit"
          @click="openEdit(previewMemory)"
        >
          {{ t('crud.edit') }}
        </Button>
        <Button
          v-if="canEditAll"
          data-testid="memory-preview-pin"
          @click="onTogglePin(previewMemory)"
        >
          {{ previewMemory.pinned ? t('contextCenter.unpin') : t('contextCenter.pin') }}
        </Button>
      </div>
    </SmDrawer>
    <MemoryFormModal
      :open="showCreateModal"
      :memory-to-edit="memoryToEdit"
      :can-delete="canDelete"
      @ok="onCreate"
      @save="onSaveEdit"
      @delete="onModalDelete"
      @cancel="showCreateModal = false; memoryToEdit = null"
      @update:open="showCreateModal = $event; if (!$event) memoryToEdit = null"
    />
    <MemoryConflictCompareModal
      :open="showCompare"
      :review="activeReview"
      @resolved="onReviewResolved"
      @cancel="showCompare = false; activeReview = null"
      @update:open="showCompare = $event; if (!$event) activeReview = null"
    />
  </div>
</template>
