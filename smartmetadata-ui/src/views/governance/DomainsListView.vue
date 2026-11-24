<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Button, Form, Input, Select, Segmented, Typography, message} from 'ant-design-vue';
import { AppstoreOutlined, ApartmentOutlined, TableOutlined } from '@ant-design/icons-vue';
import FormModal from '@/components/shared/FormModal.vue';
import { createDomain, deleteDomain, listDomains, searchDomains } from '@/api/domains';
import { usePersonaViewMode } from '@/composables/usePersonaViewMode';
import EntityCardGrid, { type EntityCardItem } from '@/features/crud/EntityCardGrid.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { requiredField } from '@/features/crud/formRules';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import { usePermissionStore } from '@/stores/permissions';
import { DOMAIN_TYPES, type Domain } from '@/types/governance';
import type { PageViewMode } from '@/types/persona';
import DomainTreeView from './DomainTreeView.vue';

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const domains = ref<Domain[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  domainType: 'Source-aligned',
  parent: undefined as string | undefined,
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'domainType', key: 'domainType', width: 180 },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('crud.parent'), key: 'parent' },
]);

const hasNext = computed(() =>
  isSearching.value
    ? total.value !== undefined && searchOffset.value + DEFAULT_PAGE_SIZE < total.value
    : canGoNext(pageAfter.value),
);
const hasPrev = computed(() => (isSearching.value ? searchOffset.value > 0 : canGoPrev(cursor.value)));

// G2 search (pin DomainListPage useListSearchInput, 300 ms debounce —
// same shape as G3's DataProductsListView search): a query switches the
// list to the ES domain index (pin SearchIndex.DOMAIN); clearing it
// restores the REST list from the first page. Stale responses are
// discarded by generation.
const searchInput = ref('');
const debouncedSearch = ref('');
const isSearching = computed(() => debouncedSearch.value.trim().length > 0);
const searchOffset = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let loadGeneration = 0;

// G2 bulk delete (pin DomainListPage useDelete, same shape as G3):
// multi-select in the table view only — pin's card view has no
// selection either. The selection is ids so it survives a reload; it
// clears on view change, on a new search, and on a fully successful
// bulk delete.
const selectedKeys = ref<string[]>([]);
const bulkDeleting = ref(false);
const rowSelection = computed(() => ({
  selectedRowKeys: selectedKeys.value,
  onChange: (keys: unknown) => {
    selectedKeys.value = (keys as string[]).filter((key) => typeof key === 'string');
  },
}));

function clearSelection(): void {
  selectedKeys.value = [];
}

// G2 tree refresh (pin DomainListPage refreshAllDomains): the tree loads
// its own hierarchy, so create/delete bumps this token and the tree
// reloads its roots while it is mounted.
const treeRefreshToken = ref(0);

/**
 * P1 dual line (pin DomainListPage.tsx:153: canCreateDomain =
 * permissions.domain?.Create || false; rendered at :247 and as the page
 * header create permission). Fail-closed — a permission fetch failure
 * hides the create button; the list itself still loads. Row/card delete
 * is out of this lane's scope (create only) and stays as-is.
 */
const resourceOps = ref<Record<string, boolean>>({});
const canCreate = computed(() => permissionStore.isAdminUser || resourceOps.value.Create === true);

async function checkPermission(): Promise<void> {
  try {
    resourceOps.value = await permissionStore.getResourcePermission('domain');
  } catch {
    resourceOps.value = {};
  }
}

/**
 * P1 dual line (pin DomainListPage.tsx:153: canCreateDomain =
 * permissions.domain?.Create || false; rendered at :247 and as the page
 * header create permission). Fail-closed — a permission fetch failure
 * hides the create button; the list itself still loads. Row/card delete
 * is out of this lane's scope (create only) and stays as-is.
 */
const resourceOps = ref<Record<string, boolean>>({});
const canCreate = computed(() => permissionStore.isAdminUser || resourceOps.value.Create === true);

async function checkPermission(): Promise<void> {
  try {
    resourceOps.value = await permissionStore.getResourcePermission('domain');
  } catch {
    resourceOps.value = {};
  }
}

// B-10: the persona view-mode chain, wired the same way as
// LearningResourcesView — the stored view is the default, the local
// selection overrides it, and a change resets paging and reloads
// (pin `DomainListPage` + `usePersonaViewMode`). G2 adds pin's third
// view, tree, to the toggle (ApartmentOutlined); the tree renders its
// own hierarchy in the #content slot.
const personaView = usePersonaViewMode('domains');
const selectedView = ref<PageViewMode | null>(null);
const view = computed<PageViewMode>(() => selectedView.value ?? personaView.value);
const viewOptions = [
  { value: 'table', label: () => h(TableOutlined) },
  { value: 'card', label: () => h(AppstoreOutlined) },
  { value: 'tree', label: () => h(ApartmentOutlined) },
];
const cardItems = computed<EntityCardItem[]>(() =>
  domains.value.map((domain) => ({
    id: domain.id,
    title: entityLabel(domain),
    description: domain.description,
    meta: domain.domainType,
    testId: domain.id,
  })),
);

function handleViewChange(next: PageViewMode): void {
  selectedView.value = next;
  cursor.value = createCursorPager();
  searchOffset.value = 0;
  clearSelection();
  void load();
}

async function load(): Promise<void> {
  const generation = ++loadGeneration;
  loading.value = true;
  errorMessage.value = '';
  try {
    if (isSearching.value) {
      const page = await searchDomains(
        debouncedSearch.value,
        searchOffset.value,
        DEFAULT_PAGE_SIZE,
      );
      if (generation !== loadGeneration) {
        return;
      }
      domains.value = page.data;
      total.value = page.total;
      pageAfter.value = undefined;
    } else {
      const page = await listDomains({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
      if (generation !== loadGeneration) {
        return;
      }
      domains.value = page.data;
      total.value = page.total;
      pageAfter.value = page.after;
    }
  } catch (error) {
    if (generation !== loadGeneration) {
      return;
    }
    domains.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    if (generation === loadGeneration) {
      loading.value = false;
    }
  }
}

function applySearch(): void {
  searchTimer = undefined;
  const query = searchInput.value.trim();
  if (query.length === 0) {
    debouncedSearch.value = '';
    searchOffset.value = 0;
    cursor.value = createCursorPager();
    clearSelection();
    void load();
    return;
  }
  debouncedSearch.value = query;
  searchOffset.value = 0;
  cursor.value = createCursorPager();
  clearSelection();
  void load();
}

function onSearchInput(value: string): void {
  searchInput.value = value;
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(applySearch, 300);
}

function onSearchEnter(): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  applySearch();
}

function onNext(): void {
  if (isSearching.value) {
    searchOffset.value += DEFAULT_PAGE_SIZE;
  } else if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  void load();
}

function onPrev(): void {
  if (isSearching.value) {
    searchOffset.value = Math.max(0, searchOffset.value - DEFAULT_PAGE_SIZE);
  } else {
    cursor.value = goPrev(cursor.value);
  }
  void load();
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createDomain({
      name: form.name.trim(),
      description: form.description.trim(),
      domainType: form.domainType,
      displayName: form.displayName.trim() || undefined,
      parent: form.parent,
    });
    createOpen.value = false;
    message.success(t('governance.domains.created', { name: created.name }));
    treeRefreshToken.value += 1;
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

/**
 * B-9: the detail route is `:fqn` — a domain without a fullyQualifiedName
 * has no addressable target, so no navigation happens (never fall back
 * to id or name for the link).
 */
function openDomain(record: Domain): void {
  if (!record.fullyQualifiedName) {
    return;
  }
  void router.push({ name: 'governance-domain', params: { fqn: record.fullyQualifiedName } });
}

async function onDelete(record: Domain): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: record.displayName || record.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteDomain(record.id, { hardDelete: true, recursive: true });
    message.success(t('crud.deletedName', { name: record.displayName || record.name }));
    treeRefreshToken.value += 1;
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

// Pin useDelete outcome shape: Promise.allSettled over the selection,
// success toast + clear selection + reload only when every delete
// succeeded; on partial failure the failed rows stay selected (so they
// can be retried) and the error names them.
async function onBulkDelete(): Promise<void> {
  const ids = [...selectedKeys.value];
  if (ids.length === 0 || bulkDeleting.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('governance.domains.bulkDeleteTitle'),
    content: t('governance.domains.bulkDeleteConfirm', { count: ids.length }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  bulkDeleting.value = true;
  try {
    const results = await Promise.allSettled(
      ids.map((id) => deleteDomain(id, { hardDelete: true, recursive: true })),
    );
    const failedNames = results.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [];
      }
      const domain = domains.value.find((item) => item.id === ids[index]);
      return [domain ? domain.displayName || domain.name : ids[index] ?? ''];
    });
    if (failedNames.length === 0) {
      message.success(t('governance.domains.bulkDeleted', { count: ids.length }));
      clearSelection();
      treeRefreshToken.value += 1;
    } else {
      message.error(t('governance.domains.bulkDeleteFailed', { names: failedNames.join(', ') }));
    }
    await load();
    if (failedNames.length > 0) {
      const remaining = new Set(domains.value.map((domain) => domain.id));
      selectedKeys.value = selectedKeys.value.filter((id) => remaining.has(id));
    }
  } finally {
    bulkDeleting.value = false;
  }
}

onBeforeUnmount(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

onMounted(() => {
  void checkPermission();
  void load();
});
</script>

<template>
  <div
    v-if="selectedKeys.length > 0"
    data-testid="domains-bulk-bar"
    class="domains-bulk-bar"
  >
    <Typography.Text strong>
      {{ t('governance.domains.selectedCount', { count: selectedKeys.length }) }}
    </Typography.Text>
    <Button data-testid="domains-clear-selection" type="link" @click="clearSelection">
      {{ t('crud.clear') }}
    </Button>
    <span class="domains-bulk-bar__spacer" />
    <Button
      danger
      data-testid="domains-bulk-delete"
      :loading="bulkDeleting"
      @click="onBulkDelete"
    >
      {{ t('crud.delete') }}
    </Button>
  </div>
  <EntityListShell
    :title="t('governance.domains.title')"
    :lead="t('governance.domains.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="domains"
    table-test-id="domains-table"
    show-row-actions
    show-edit-action
    show-search
    :search-value="searchInput"
    :search-placeholder="t('governance.domains.searchPlaceholder')"
    :row-selection="rowSelection"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @update:search-value="onSearchInput"
    @search="onSearchEnter"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => openDomain(record as Domain)"
    @edit="(record) => openDomain(record as Domain)"
    @delete="(record) => onDelete(record as Domain)"
  >
    <template #actions>
      <Segmented
        :value="view"
        :options="viewOptions"
        data-testid="domains-view-toggle"
        @update:value="handleViewChange($event as PageViewMode)"
      />
      <Button v-if="canCreate" type="primary" data-testid="create-domain" @click="createOpen = true">
        {{ t('governance.domains.create') }}
      </Button>
    </template>
    <template v-if="view === 'card'" #content>
      <EntityCardGrid
        :items="cardItems"
        show-delete
        test-id="domains-cards"
        @open="(id) => openDomain(domains.find((domain) => domain.id === id) as Domain)"
        @delete="(id) => onDelete(domains.find((domain) => domain.id === id) as Domain)"
      />
    </template>
    <template v-if="view === 'tree'" #content>
      <DomainTreeView
        :search-query="debouncedSearch"
        :refresh-token="treeRefreshToken"
        @open="(domain) => openDomain(domain)"
      />
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`domain-row-${(record as Domain).id}`"
          @click.prevent="openDomain(record as Domain)"
        >
          {{ entityLabel(record as Domain) }}
        </a>
      </template>
      <template v-else-if="column.key === 'parent'">
        {{ (record as Domain).parent?.name || '—' }}
      </template>
    </template>
  </EntityListShell>
  <FormModal
    :open="createOpen"
    :title="t('governance.domains.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate" @cancel="createOpen = false">
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-domain-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('governance.domains.type')" required>
        <Select v-model:value="form.domainType">
          <Select.Option v-for="type in DOMAIN_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item :label="t('governance.domains.parentDomain')" :extra="t('governance.domains.parentDomainHelp')">
        <Select v-model:value="form.parent" allow-clear>
          <Select.Option
            v-for="domain in domains"
            :key="domain.id"
            :value="domain.fullyQualifiedName || domain.name"
          >
            {{ entityLabel(domain) }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </FormModal>
</template>

<style scoped>
.domains-bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--sm-color-primary-bg);
  border-radius: 8px;
}

.domains-bulk-bar__spacer {
  flex: 1;
}
</style>
