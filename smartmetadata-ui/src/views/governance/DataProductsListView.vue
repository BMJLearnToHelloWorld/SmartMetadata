<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Select, Segmented, Typography, message } from 'ant-design-vue';
import { AppstoreOutlined, TableOutlined } from '@ant-design/icons-vue';
import FormModal from '@/components/shared/FormModal.vue';
import { createDataProduct, deleteDataProduct, listDataProducts, searchDataProducts } from '@/api/dataProducts';
import { usePersonaViewMode } from '@/composables/usePersonaViewMode';
import EntityCardGrid, { type EntityCardItem } from '@/features/crud/EntityCardGrid.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { listDomains } from '@/api/domains';
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
  joinRefNames,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import { usePermissionStore } from '@/stores/permissions';
import type { DataProduct, Domain } from '@/types/governance';
import type { PageViewMode } from '@/types/persona';

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const products = ref<DataProduct[]>([]);
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
  domainFqns: [] as string[],
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('governance.dataProducts.domains'), key: 'domains' },
]);

// G3 search (pin DataProductListPage useListSearchInput, 300 ms debounce):
// a query switches the list to the ES dataProduct index (pin
// SearchIndex.DATA_PRODUCT); clearing it restores the REST list from
// the first page. Same shape as ContextCenterDocumentsView's G-20
// search — debounced while typing, immediate on Enter, stale responses
// discarded by generation.
const searchInput = ref('');
const debouncedSearch = ref('');
const isSearching = computed(() => debouncedSearch.value.trim().length > 0);
const searchOffset = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let loadGeneration = 0;

const hasNext = computed(() =>
  isSearching.value
    ? total.value !== undefined && searchOffset.value + DEFAULT_PAGE_SIZE < total.value
    : canGoNext(pageAfter.value),
);
const hasPrev = computed(() => (isSearching.value ? searchOffset.value > 0 : canGoPrev(cursor.value)));

// G3 bulk delete (pin DataProductListPage useDelete): multi-select in
// the table view only — pin's card view has no selection either. The
// selection is ids so it survives a reload; it clears on view change,
// on a new search, and on a fully successful bulk delete.
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

/**
 * P1 dual line (pin DataProductListPage.tsx:244,367,453:
 * permissions.dataProduct?.Create gates the page header create button
 * and the empty-state action). Fail-closed — a permission fetch failure
 * hides the create button; the list itself still loads. Row/card delete
 * is out of this lane's scope (create only) and stays as-is.
 */
const resourceOps = ref<Record<string, boolean>>({});
const canCreate = computed(() => permissionStore.isAdminUser || resourceOps.value.Create === true);

async function checkPermission(): Promise<void> {
  try {
    resourceOps.value = await permissionStore.getResourcePermission('dataProduct');
  } catch {
    resourceOps.value = {};
  }
}

// B-10: same persona view-mode chain as DomainsListView /
// LearningResourcesView — stored view is the default, the local
// selection overrides it, a change resets paging and reloads (pin
// `DataProductListPage` + `usePersonaViewMode`).
const personaView = usePersonaViewMode('dataProducts');
const selectedView = ref<PageViewMode | null>(null);
const view = computed<PageViewMode>(() => selectedView.value ?? personaView.value);
const viewOptions = [
  { value: 'table', label: () => h(TableOutlined) },
  { value: 'card', label: () => h(AppstoreOutlined) },
];
const cardItems = computed<EntityCardItem[]>(() =>
  products.value.map((product) => ({
    id: product.id,
    title: entityLabel(product),
    description: product.description,
    meta: joinRefNames(product.domains) || undefined,
    testId: product.id,
  })),
);

function handleViewChange(next: PageViewMode): void {
  selectedView.value = next;
  cursor.value = createCursorPager();
  searchOffset.value = 0;
  clearSelection();
  void load();
}

function openProduct(record: DataProduct): void {
  void router.push({ name: 'governance-data-product', params: { id: record.id } });
}

async function load(): Promise<void> {
  const generation = ++loadGeneration;
  loading.value = true;
  errorMessage.value = '';
  try {
    if (isSearching.value) {
      const page = await searchDataProducts(
        debouncedSearch.value,
        searchOffset.value,
        DEFAULT_PAGE_SIZE,
      );
      if (generation !== loadGeneration) {
        return;
      }
      products.value = page.data;
      total.value = page.total;
      pageAfter.value = undefined;
    } else {
      const page = await listDataProducts({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
      if (generation !== loadGeneration) {
        return;
      }
      products.value = page.data;
      total.value = page.total;
      pageAfter.value = page.after;
    }
  } catch (error) {
    if (generation !== loadGeneration) {
      return;
    }
    products.value = [];
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
    const created = await createDataProduct({
      name: form.name.trim(),
      description: form.description.trim(),
      displayName: form.displayName.trim() || undefined,
      domains: form.domainFqns,
    });
    createOpen.value = false;
    message.success(t('governance.dataProducts.created', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

async function onDelete(record: DataProduct): Promise<void> {
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
    await deleteDataProduct(record.id);
    message.success(t('crud.deletedName', { name: record.displayName || record.name }));
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
    title: t('governance.dataProducts.bulkDeleteTitle'),
    content: t('governance.dataProducts.bulkDeleteConfirm', { count: ids.length }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  bulkDeleting.value = true;
  try {
    const results = await Promise.allSettled(ids.map((id) => deleteDataProduct(id)));
    const failedNames = results.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [];
      }
      const product = products.value.find((item) => item.id === ids[index]);
      return [product ? product.displayName || product.name : ids[index] ?? ''];
    });
    if (failedNames.length === 0) {
      message.success(t('governance.dataProducts.bulkDeleted', { count: ids.length }));
      clearSelection();
    } else {
      message.error(t('governance.dataProducts.bulkDeleteFailed', { names: failedNames.join(', ') }));
    }
    await load();
    if (failedNames.length > 0) {
      const remaining = new Set(products.value.map((product) => product.id));
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
  void listDomains({ limit: 100 })
    .then((page) => {
      domains.value = page.data;
    })
    .catch(() => undefined);
});
</script>

<template>
  <div
    v-if="selectedKeys.length > 0"
    data-testid="data-products-bulk-bar"
    class="data-products-bulk-bar"
  >
    <Typography.Text strong>
      {{ t('governance.dataProducts.selectedCount', { count: selectedKeys.length }) }}
    </Typography.Text>
    <Button data-testid="data-products-clear-selection" type="link" @click="clearSelection">
      {{ t('crud.clear') }}
    </Button>
    <span class="data-products-bulk-bar__spacer" />
    <Button
      danger
      data-testid="data-products-bulk-delete"
      :loading="bulkDeleting"
      @click="onBulkDelete"
    >
      {{ t('crud.delete') }}
    </Button>
  </div>
  <EntityListShell
    :title="t('governance.dataProducts.title')"
    :lead="t('governance.dataProducts.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="products"
    table-test-id="data-products-table"
    show-row-actions
    show-edit-action
    show-search
    :search-value="searchInput"
    :search-placeholder="t('governance.dataProducts.searchPlaceholder')"
    :row-selection="rowSelection"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @update:search-value="onSearchInput"
    @search="onSearchEnter"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'governance-data-product', params: { id: (record as DataProduct).id } })"
    @edit="(record) => router.push({ name: 'governance-data-product', params: { id: (record as DataProduct).id } })"
    @delete="(record) => onDelete(record as DataProduct)"
  >
    <template #actions>
      <Segmented
        :value="view"
        :options="viewOptions"
        data-testid="data-products-view-toggle"
        @update:value="handleViewChange($event as PageViewMode)"
      />
      <Button v-if="canCreate" type="primary" data-testid="create-data-product" @click="createOpen = true">
        {{ t('governance.dataProducts.create') }}
      </Button>
    </template>
    <template v-if="view === 'card'" #content>
      <EntityCardGrid
        :items="cardItems"
        show-delete
        test-id="data-products-cards"
        @open="(id) => openProduct(products.find((product) => product.id === id) as DataProduct)"
        @delete="(id) => onDelete(products.find((product) => product.id === id) as DataProduct)"
      />
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`data-product-row-${(record as DataProduct).id}`"
          @click.prevent="
            router.push({ name: 'governance-data-product', params: { id: (record as DataProduct).id } })
          "
        >
          {{ entityLabel(record as DataProduct) }}
        </a>
      </template>
      <template v-else-if="column.key === 'domains'">
        {{ joinRefNames((record as DataProduct).domains) || '—' }}
      </template>
    </template>
  </EntityListShell>
  <FormModal
    :open="createOpen"
    :title="t('governance.dataProducts.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate" @cancel="createOpen = false">
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-data-product-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('governance.dataProducts.domains')" required>
        <Select v-model:value="form.domainFqns" mode="multiple" data-testid="create-data-product-domains">
          <Select.Option
            v-for="domain in domains"
            :key="domain.id"
            :value="domain.fullyQualifiedName || domain.name"
          >
            {{ entityLabel(domain) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
    </Form>
  </FormModal>
</template>

<style scoped>
.data-products-bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--sm-color-primary-bg);
  border-radius: 8px;
}

.data-products-bulk-bar__spacer {
  flex: 1;
}
</style>
