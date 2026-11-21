<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { EditOutlined } from '@ant-design/icons-vue';
import { Alert, Button, Input, message, Switch, Tag, Typography } from 'ant-design-vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { getDerivedPermissionFlags, type OperationPermissions } from '@/api/permissions';
import { searchAssets } from '@/api/search';
import { listTables, patchTableDetails, type SchemaTableRow } from '@/api/tables';
import { diffJsonPatch } from '@/admin/jsonPatch';
import { assetLocation } from '@/catalog/entityRoutes';
import { buildSchemaQueryFilter } from '@/catalog/searchFilters';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { joinRefNames } from '@/features/crud/paging';
import { getCertificationTag, getTierTag } from '@/ingestion/tierTags';
import { usePermissionStore } from '@/stores/permissions';
import type { TableProps } from 'ant-design-vue';
import type { Paging, PagingHandlerParams } from '@/utils/pagination';

/**
 * Tables (pin SchemaTablesTab.tsx): the tables of a database schema.
 * Self-fetches — REST list by default, Elasticsearch search while a
 * query is active — with show-deleted and cursor/number paging.
 * Row permissions are resource-level (pin: `getDerivedPermissionFlags(
 * permissions.table)`): display-name editing is gated on the derived
 * `canEditDisplayName`, bulk edit on `canEditAll`, each OR-ed with
 * `isAdminUser` (P1 dual line). The view gate is `canViewBasic` on the
 * schema's own entity permission, passed in as `canView`; while it is
 * unresolved (null) the widget fetches nothing (fail-closed). The
 * display-name edit additionally requires the schema not to be deleted
 * (D-6; pin's derivation itself carries no `deleted`).
 */
const props = withDefaults(
  defineProps<{
    schemaFqn: string;
    deleted?: boolean;
    /** Schema's own canViewBasic; null while the view's permission load is unresolved. */
    canView?: boolean | null;
  }>(),
  { deleted: false, canView: null },
);

const { t } = useI18n();
const router = useRouter();

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 500;

const permissionStore = usePermissionStore();
const isAdminUser = computed(() => permissionStore.isAdminUser);
const tableOps = ref<OperationPermissions>({});
const tableOpsLoaded = ref(false);

const rows = ref<SchemaTableRow[]>([]);
const loading = ref(false);
const error = ref('');
const paging = ref<Paging>({ total: 0 });
const currentPage = ref(1);
const showDeleted = ref(false);
const searchInput = ref('');
const searchValue = ref('');

const editingName = ref<SchemaTableRow | null>(null);
const editingNameValue = ref('');
const savingName = ref(false);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let fetchSeq = 0;

const displayNameFlags = computed(() => getDerivedPermissionFlags(tableOps.value));
const bulkEditFlags = computed(() => getDerivedPermissionFlags(tableOps.value, props.deleted));
const canEditDisplayName = computed(
  () => (isAdminUser.value || displayNameFlags.value.canEditDisplayName) && !props.deleted,
);
const canBulkEdit = computed(() => isAdminUser.value || bulkEditFlags.value.canEditAll);

const columns: TableProps['columns'] = [
  {
    title: t('label.name'),
    dataIndex: 'name',
    key: 'name',
    width: 280,
    sorter: (a: unknown, b: unknown) =>
      String((a as SchemaTableRow).name ?? '').localeCompare(String((b as SchemaTableRow).name ?? '')),
  },
  { title: t('label.description'), dataIndex: 'description', key: 'description' },
  { title: t('label.owner-plural'), dataIndex: 'owners', key: 'owners' },
  { title: t('label.domain-plural'), dataIndex: 'domains', key: 'domains' },
  { title: t('label.data-product-plural'), dataIndex: 'dataProducts', key: 'dataProducts' },
  { title: t('label.tag-plural'), dataIndex: 'tags', key: 'tags' },
  { title: t('label.tier'), dataIndex: 'tier', key: 'tier' },
  { title: t('label.certification'), dataIndex: 'certification', key: 'certification' },
];

function visibleTags(row: SchemaTableRow) {
  const tier = getTierTag(row.tags ?? []);
  const certification = getCertificationTag(row.tags ?? []);
  return (row.tags ?? []).filter((tag) => tag !== tier && tag !== certification);
}

function onSearchInput(value: string): void {
  searchInput.value = value;
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchValue.value = value.trim();
    currentPage.value = 1;
    paging.value = { total: 0 };
    void fetchTables();
  }, SEARCH_DEBOUNCE_MS);
}

function onShowDeletedChange(value: boolean): void {
  showDeleted.value = value;
  currentPage.value = 1;
  paging.value = { total: 0 };
  void fetchTables();
}

async function fetchTables(cursor?: { cursorType: 'after' | 'before'; cursorValue?: string }): Promise<void> {
  if (props.canView !== true) {
    return;
  }
  const seq = ++fetchSeq;
  loading.value = true;
  error.value = '';
  try {
    if (searchValue.value) {
      const page = await searchAssets('', (currentPage.value - 1) * PAGE_SIZE, PAGE_SIZE, {
        index: 'table',
        query_filter: buildSchemaQueryFilter(
          'databaseSchema.fullyQualifiedName.keyword',
          props.schemaFqn,
          searchValue.value,
        ),
        deleted: showDeleted.value ? true : undefined,
      });
      if (seq !== fetchSeq) {
        return;
      }
      rows.value = page.hits.map((hit) => ({
        id: hit.id ?? hit.fullyQualifiedName,
        name: hit.name,
        displayName: hit.displayName,
        fullyQualifiedName: hit.fullyQualifiedName,
        description: hit.description,
        owners: hit.owners,
        domains: hit.domains ?? [],
        dataProducts: hit.dataProducts ?? [],
        tags: hit.tags ?? [],
        certification: (() => {
          const tag = getCertificationTag(hit.tags ?? []);
          return tag ? { tagLabel: tag } : undefined;
        })(),
      }));
      paging.value = { total: page.total };
    } else {
      const page = await listTables({
        databaseSchema: props.schemaFqn,
        limit: PAGE_SIZE,
        include: showDeleted.value ? 'deleted' : 'non-deleted',
        ...(cursor?.cursorType === 'after' ? { after: cursor.cursorValue } : {}),
        ...(cursor?.cursorType === 'before' ? { before: cursor.cursorValue } : {}),
      });
      if (seq !== fetchSeq) {
        return;
      }
      rows.value = page.data;
      paging.value = { total: page.total ?? page.data.length, after: page.after, before: page.before };
    }
  } catch (err) {
    if (seq !== fetchSeq) {
      return;
    }
    rows.value = [];
    error.value = err instanceof Error ? err.message : t('crud.loadFailed');
  } finally {
    if (seq === fetchSeq) {
      loading.value = false;
    }
  }
}

function onPagingChange({ cursorType, currentPage: nextPage }: PagingHandlerParams): void {
  currentPage.value = nextPage;
  if (searchValue.value) {
    void fetchTables();
    return;
  }
  if (!cursorType) {
    void fetchTables();
    return;
  }
  const cursorValue = cursorType === 'before' ? paging.value.before : paging.value.after;
  void fetchTables({ cursorType, cursorValue });
}

function startNameEdit(row: SchemaTableRow): void {
  editingName.value = row;
  editingNameValue.value = row.displayName ?? row.name;
}

function cancelNameEdit(): void {
  editingName.value = null;
  editingNameValue.value = '';
}

async function saveNameEdit(): Promise<void> {
  const row = editingName.value;
  if (!row || savingName.value) {
    return;
  }
  const newName = editingNameValue.value.trim();
  if (!newName || newName === (row.displayName ?? row.name)) {
    cancelNameEdit();
    return;
  }
  savingName.value = true;
  try {
    const patch = diffJsonPatch({ displayName: row.displayName ?? row.name }, { displayName: newName });
    const updated = await patchTableDetails(row.fullyQualifiedName, patch);
    rows.value = rows.value.map((item) =>
      item.fullyQualifiedName === row.fullyQualifiedName ? { ...item, displayName: updated.displayName } : item,
    );
    cancelNameEdit();
  } catch (err) {
    message.error(err instanceof Error ? err.message : t('message.something-went-wrong'));
  } finally {
    savingName.value = false;
  }
}

function goBulkEdit(): void {
  void router.push({
    name: 'bulk-edit',
    params: { entityType: 'table', fqn: props.schemaFqn },
  });
}

function openTable(row: SchemaTableRow): void {
  void router.push(assetLocation('table', row.fullyQualifiedName));
}

async function loadTablePermissions(): Promise<void> {
  try {
    tableOps.value = await permissionStore.getResourcePermission('table');
  } catch {
    // Fail-closed: a permission fetch failure leaves the flags at their
    // default (all false) instead of unlocking the edit actions.
    tableOps.value = {};
  } finally {
    tableOpsLoaded.value = true;
  }
}

onMounted(() => {
  void loadTablePermissions();
  void fetchTables();
});

watch(
  () => props.canView,
  (canView) => {
    if (canView === true) {
      void fetchTables();
    }
  },
);

watch(
  () => props.schemaFqn,
  () => {
    searchInput.value = '';
    searchValue.value = '';
    showDeleted.value = false;
    currentPage.value = 1;
    paging.value = { total: 0 };
    void fetchTables();
  },
);

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});
</script>

<template>
  <div data-testid="schema-tables-widget">
    <div class="lists-widget__toolbar">
      <Input
        :value="searchInput"
        data-testid="search-tables-input"
        class="lists-widget__search"
        :placeholder="t('label.search-for-type', { type: t('label.table') })"
        @update:value="onSearchInput(String($event))"
      />
      <span class="lists-widget__toggle">
        <Switch :checked="showDeleted" data-testid="show-deleted" size="small" @change="onShowDeletedChange(Boolean($event))" />
        <Typography.Text>{{ t('lists.deleted') }}</Typography.Text>
      </span>
      <span v-if="tableOpsLoaded && canBulkEdit" class="lists-widget__spacer" />
      <Button v-if="tableOpsLoaded && canBulkEdit" data-testid="bulk-edit-table" type="link" @click="goBulkEdit">
        {{ t('crud.edit') }}
      </Button>
    </div>
    <Alert v-if="error" type="error" show-icon :message="error" class="lists-widget__alert" />
    <SmTable
      row-key="fullyQualifiedName"
      test-id="schema-tables-table"
      :columns="columns"
      :data-source="rows"
      :loading="loading || canView === null"
      :pagination="false"
      size="small"
      :empty-text="searchValue ? t('label.no-matching-result-plural') : t('lists.noEntityDataAvailable', { entity: t('label.table-plural') })"
      :custom-row="(row: SchemaTableRow) => ({ onClick: () => openTable(row) })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span v-if="editingName && (editingName as SchemaTableRow).fullyQualifiedName === (record as SchemaTableRow).fullyQualifiedName" class="lists-widget__name-edit" @click.stop>
            <Input v-model:value="editingNameValue" size="small" @keyup.enter="saveNameEdit" @keyup.esc="cancelNameEdit" />
            <Button type="link" size="small" :loading="savingName" @click="saveNameEdit">{{ t('crud.save') }}</Button>
            <Button type="link" size="small" @click="cancelNameEdit">{{ t('crud.cancel') }}</Button>
          </span>
          <span v-else class="lists-widget__name-cell">
            <a href="#" @click.prevent="openTable(record as SchemaTableRow)">
              {{ (record as SchemaTableRow).displayName || (record as SchemaTableRow).name }}
            </a>
            <Button
              v-if="tableOpsLoaded && canEditDisplayName"
              type="text"
              size="small"
              :data-testid="`edit-display-name-${(record as SchemaTableRow).name}`"
              :aria-label="t('crud.edit')"
              @click.stop="startNameEdit(record as SchemaTableRow)"
            >
              <EditOutlined />
            </Button>
          </span>
        </template>
        <template v-else-if="column.key === 'description'">
          <DescriptionCell :markdown="(record as SchemaTableRow).description" />
        </template>
        <template v-else-if="column.key === 'owners'">
          {{ joinRefNames((record as SchemaTableRow).owners) || '—' }}
        </template>
        <template v-else-if="column.key === 'domains'">
          {{ joinRefNames((record as SchemaTableRow).domains) || '—' }}
        </template>
        <template v-else-if="column.key === 'dataProducts'">
          {{ joinRefNames((record as SchemaTableRow).dataProducts) || '—' }}
        </template>
        <template v-else-if="column.key === 'tags'">
          <Tag v-for="tag in visibleTags(record as SchemaTableRow)" :key="tag.tagFQN">{{ tag.name || tag.tagFQN }}</Tag>
          <span v-if="visibleTags(record as SchemaTableRow).length === 0">—</span>
        </template>
        <template v-else-if="column.key === 'tier'">
          {{ getTierTag((record as SchemaTableRow).tags ?? [])?.name || '—' }}
        </template>
        <template v-else-if="column.key === 'certification'">
          {{ getCertificationTag((record as SchemaTableRow).tags ?? [])?.name || '—' }}
        </template>
      </template>
    </SmTable>
    <div v-if="(paging.total ?? 0) > PAGE_SIZE" class="lists-widget__pager">
      <NextPrevious
        :paging="paging"
        :page-size="PAGE_SIZE"
        :current-page="currentPage"
        :is-number-based="Boolean(searchValue)"
        :is-loading="loading"
        :paging-handler="onPagingChange"
      />
    </div>
  </div>
</template>

<style scoped>
.lists-widget__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.lists-widget__search {
  max-width: 320px;
}
.lists-widget__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lists-widget__spacer {
  flex: 1;
}
.lists-widget__alert {
  margin-bottom: 12px;
}
.lists-widget__pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.lists-widget__name-cell {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.lists-widget__name-edit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
