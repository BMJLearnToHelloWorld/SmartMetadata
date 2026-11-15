<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<template>
  <div id="tablequeries" class="table-queries" data-testid="queries-container">
    <Spin v-if="pageLoading" />
    <!-- Pin PermissionPlaceholder for the ViewQueries denial: the
         Access Denied title plus the no-access sentence naming the
         missing View Queries permission. -->
    <div v-else-if="denied" data-testid="query-view-denied" class="table-queries__placeholder">
      <h3>{{ t('query.accessDenied') }}</h3>
      <Empty :description="t('query.noAccessPlaceholder', { entity: t('query.viewQueries') })" />
    </div>
    <div v-else-if="isTableDeleted" data-testid="no-queries">
      <Empty
        data-testid="no-data-placeholder"
        :description="t('query.deletedFieldData', { field: t('query.queries') })"
      />
    </div>
    <div
      v-else-if="pageError"
      :data-testid="`create-error-placeholder-${t('query.queriesLower')}`"
      class="table-queries__placeholder"
    >
      <!-- Pin CreatePlaceholder with permission === false falls back to
           PermissionPlaceholder: Access Denied plus the no-access
           sentence naming Create Query. A failed Create-permission
           read fails closed into this state, as the ViewQueries
           denial above does. -->
      <div v-if="!canCreate" data-testid="permission-error-placeholder">
        <h3>{{ t('query.accessDenied') }}</h3>
        <Empty :description="t('query.noAccessPlaceholder', { entity: t('query.createQuery') })" />
      </div>
      <!-- Pin CreatePlaceholder: the Add action, the adding-new
           sentence, and the refer-to-docs sentence with the docs link. -->
      <Empty v-else :description="t('query.addingNewEasy', { entity: t('query.queriesLower') })">
        <p>
          {{ t('query.referToDocsBefore') }}<a :href="USAGE_DOCS_URL" target="_blank" rel="noopener noreferrer">{{ t('query.docs') }}</a>{{ t('query.referToDocsAfter') }}
        </p>
        <Button type="primary" data-testid="add-query-btn" @click="onAddQuery">
          {{ t('crud.add') }}
        </Button>
      </Empty>
    </div>
    <template v-else>
      <div class="table-queries__toolbar">
        <Select
          :value="selectedOwnerKeys"
          mode="multiple"
          show-search
          :filter-option="false"
          :loading="ownersLoading"
          :placeholder="t('query.ownerFilter')"
          :options="ownerSelectOptions"
          data-testid="owner-filter"
          @focus="ensureInitialOwnerOptions"
          @search="onOwnerSearch"
          @change="onOwnerFilterChange"
        />
        <Select
          :value="selectedTagKeys"
          mode="multiple"
          show-search
          :filter-option="false"
          :loading="tagsLoading"
          :placeholder="t('query.tagFilter')"
          :options="tagSelectOptions"
          data-testid="tag-filter"
          @focus="ensureInitialTagOptions"
          @search="onTagSearch"
          @change="onTagFilterChange"
        />
        <DatePicker.RangePicker
          :value="rangeValue ?? undefined"
          data-testid="data-range-picker"
          @change="onDateChange"
        />
        <Select
          :value="sortField"
          :options="sortSelectOptions"
          data-testid="sort-field-select"
          @change="onSortFieldChange"
        />
        <Tooltip :title="t('query.sortOrder')">
          <Button data-testid="sort-order-button" :aria-label="t('query.sortOrder')" @click="onSortOrderChange">
            {{ sortOrder === 'asc' ? '↑' : '↓' }}
          </Button>
        </Tooltip>
        <Tooltip :title="canCreate ? '' : t('crud.noPermissionForAction')">
          <Button type="primary" data-testid="add-query-btn" :disabled="!canCreate" @click="onAddQuery">
            {{ t('crud.add') }}
          </Button>
        </Tooltip>
      </div>

      <div class="table-queries__body">
        <div class="table-queries__list">
          <Spin v-if="listLoading" />
          <div v-else-if="searchError" data-testid="no-queries">
            <Empty
              data-testid="no-data-placeholder"
              :description="t('query.addingNewEasy', { entity: t('query.queriesLower') })"
            />
          </div>
          <template v-else>
            <QueryCard
              v-for="query in queries"
              :key="query.id"
              :query="query"
              :selected="query.id === selectedQuery?.id"
              :permission="queryPermission"
              :dataset-fqn="datasetFqn"
              :current-user-id="currentUserId"
              :on-query-update="handleQueryUpdate"
              @select="onQuerySelection"
              @vote="(voteType) => updateVote(query, voteType)"
              @deleted="afterDeleteAction"
            />
            <Pagination
              v-if="total > 0"
              :current="currentPage"
              :page-size="pageSize"
              :total="total"
              :page-size-options="pageSizeOptions"
              show-size-changer
              data-testid="query-pagination"
              @change="onPaging"
            />
          </template>
        </div>
        <TableQueryRightPanel
          v-if="selectedQuery"
          :query="selectedQuery"
          :is-loading="panelLoading"
          :permission="queryPermission"
          :on-query-update="handleQueryUpdate"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { JsonPatchOp } from '@/admin/jsonPatch';
import {
  getQueryDetails,
  patchQuery,
  voteQuery,
  type DataQuery,
  type VoteType,
} from '@/api/queries';
import { getDerivedPermissionFlags, type DerivedPermissionFlags } from '@/api/permissions';
import { searchAssets, searchQueries } from '@/api/search';
import {
  buildFilterOptionsQuery,
  createQueryFilter,
  QUERY_DEFAULT_PAGE_SIZE,
  QUERY_DEFAULT_SORT,
  QUERY_FILTER_PAGE_SIZE,
  QUERY_OWNER_FILTER,
  QUERY_PAGE_SIZE_OPTIONS,
  QUERY_SORT_OPTIONS,
  QUERY_TAG_FILTER,
  USAGE_DOCS_URL,
  type QueryFilterOption,
  type QuerySortField,
  type QuerySortOrder,
  type QueryTimeRange,
} from '@/catalog/queryFilter';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import { Button, DatePicker, Empty, Pagination, Select, Spin, Tooltip, message } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import dayjs, { type Dayjs } from 'dayjs';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import QueryCard from './QueryCard.vue';
import TableQueryRightPanel from './TableQueryRightPanel.vue';

const props = defineProps<{
  tableId: string;
  datasetFqn: string;
  isTableDeleted?: boolean;
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();
const authStore = useAuthStore();

const currentUserId = computed(() => authStore.user?.id ?? '');

// Pin QuerySearchParams round-trip: the initial page comes from
// `queryFrom`; the page size from `pageSize`. Writes merge into the
// existing query string (pin replaces it wholesale, which would drop
// the fork's `tab` param and bounce the detail view off this tab).
const initialPage = Number(route.query.queryFrom) || 1;
const initialPageSize = Number(route.query.pageSize) || QUERY_DEFAULT_PAGE_SIZE;

const pageLoading = ref(true);
const listLoading = ref(false);
const panelLoading = ref(false);
const pageError = ref(false);
const searchError = ref(false);
const denied = ref(false);
const canCreate = ref(false);

const queries = ref<DataQuery[]>([]);
const total = ref(0);
const currentPage = ref(initialPage);
const pageSize = ref(initialPageSize);
const sortField = ref<QuerySortField>(QUERY_DEFAULT_SORT.field);
const sortOrder = ref<QuerySortOrder>(QUERY_DEFAULT_SORT.order);

const selectedQuery = ref<DataQuery | undefined>(undefined);
const queryPermission = ref<DerivedPermissionFlags>(getDerivedPermissionFlags({}));

const selectedTags = ref<QueryFilterOption[]>([]);
const selectedOwners = ref<QueryFilterOption[]>([]);
const timeRange = ref<QueryTimeRange | undefined>(undefined);
const rangeValue = ref<[Dayjs, Dayjs] | null>(null);

const tagOptions = ref<QueryFilterOption[]>([]);
const ownerOptions = ref<QueryFilterOption[]>([]);
const initialTagOptions = ref<QueryFilterOption[]>([]);
const initialOwnerOptions = ref<QueryFilterOption[]>([]);
const tagsLoading = ref(false);
const ownersLoading = ref(false);
const tagOptionsCache = new Map<string, QueryFilterOption>();
const ownerOptionsCache = new Map<string, QueryFilterOption>();

const pageSizeOptions = QUERY_PAGE_SIZE_OPTIONS.map(String);
const sortSelectOptions = computed(() =>
  QUERY_SORT_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) })),
);
const selectedTagKeys = computed(() => selectedTags.value.map((option) => option.key));
const selectedOwnerKeys = computed(() => selectedOwners.value.map((option) => option.key));
const tagSelectOptions = computed(() =>
  tagOptions.value.map((option) => ({ value: option.key, label: option.label })),
);
const ownerSelectOptions = computed(() =>
  ownerOptions.value.map((option) => ({ value: option.key, label: option.label })),
);

function writeUrl(patch: Record<string, string | number>): void {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === 'string') {
      next[key] = value;
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    next[key] = String(value);
  }
  void router.replace({ query: next });
}

interface FetchQueriesArgs {
  pageNumber?: number;
  pageSize?: number;
  sortField?: QuerySortField;
  sortOrder?: QuerySortOrder;
  /** Pin pagingHandler drops the active filters from the refetch. */
  dropFilters?: boolean;
}

async function fetchQueries(args: FetchQueriesArgs = {}): Promise<void> {
  const pageNumber = args.pageNumber ?? 1;
  const size = args.pageSize ?? pageSize.value;
  const field = args.sortField ?? sortField.value;
  const order = args.sortOrder ?? sortOrder.value;
  const tags = args.dropFilters ? [] : selectedTags.value;
  const owners = args.dropFilters ? [] : selectedOwners.value;
  const range = args.dropFilters ? undefined : timeRange.value;
  const isFilterSelected = tags.length > 0 || owners.length > 0 || range !== undefined;

  listLoading.value = true;
  try {
    const page = await searchQueries('*', (pageNumber - 1) * size, size, {
      sortField: field,
      sortOrder: order,
      query_filter: JSON.stringify(
        createQueryFilter({ tableId: props.tableId, tags, owners, timeRange: range }),
      ),
    });
    currentPage.value = pageNumber;
    pageSize.value = size;
    sortField.value = field;
    sortOrder.value = order;
    if (page.queries.length === 0) {
      total.value = 0;
      queries.value = [];
      selectedQuery.value = undefined;
      searchError.value = isFilterSelected;
      pageError.value = !isFilterSelected;
      return;
    }
    total.value = page.total;
    queries.value = page.queries;
    searchError.value = false;
    pageError.value = false;
    const urlQueryId = typeof route.query.query === 'string' ? route.query.query : undefined;
    const nextSelected = urlQueryId
      ? (page.queries.find((query) => query.id === urlQueryId) ?? page.queries[0])
      : page.queries[0];
    selectedQuery.value = nextSelected;
    writeUrl({
      tableId: props.tableId,
      query: nextSelected?.id ?? '',
      queryFrom: pageNumber,
      currentPage: pageNumber,
      pageSize: size,
    });
  } catch {
    message.error(t('query.loadFailed'));
    total.value = 0;
    queries.value = [];
    selectedQuery.value = undefined;
    searchError.value = isFilterSelected;
    pageError.value = !isFilterSelected;
  } finally {
    listLoading.value = false;
  }
}

// REST hydrate + query-entity permission for the right panel (ruling
// D-F14: the search hit may lack `users`, so the panel reads the full
// entity). A stale selection change discards its own completion.
let hydrateToken = 0;
watch(
  () => selectedQuery.value?.id,
  async (queryId) => {
    if (!queryId) {
      // The selection was cleared (empty/error fetch): invalidate any
      // in-flight hydrate so it cannot resurrect a selection for a
      // query no longer in the list, and release the panel spinner.
      hydrateToken++;
      panelLoading.value = false;
      return;
    }
    const token = ++hydrateToken;
    panelLoading.value = true;
    try {
      const ops = await permissionStore.getEntityPermissionById('query', queryId).catch(() => null);
      if (token !== hydrateToken) {
        return;
      }
      if (ops === null) {
        message.error(t('query.fetchPermissionsError'));
        queryPermission.value = getDerivedPermissionFlags({});
      } else {
        queryPermission.value = getDerivedPermissionFlags(ops);
      }
      const hydrated = await getQueryDetails(queryId).catch(() => null);
      if (token !== hydrateToken) {
        return;
      }
      if (hydrated) {
        selectedQuery.value = hydrated;
        queries.value = queries.value.map((query) => (query.id === hydrated.id ? hydrated : query));
      } else {
        message.error(t('query.loadQueryFailed'));
      }
    } finally {
      if (token === hydrateToken) {
        panelLoading.value = false;
      }
    }
  },
  { immediate: true },
);

function onQuerySelection(queryId: string): void {
  const query = queries.value.find((candidate) => candidate.id === queryId);
  if (!query || query.id === selectedQuery.value?.id) {
    return;
  }
  panelLoading.value = true;
  selectedQuery.value = query;
  writeUrl({ query: queryId });
}

async function handleQueryUpdate(id: string, ops: JsonPatchOp[]): Promise<DataQuery> {
  const updated = await patchQuery(id, ops);
  selectedQuery.value =
    selectedQuery.value?.id === id ? { ...selectedQuery.value, ...updated } : selectedQuery.value;
  queries.value = queries.value.map((query) =>
    query.id === id ? { ...query, ...updated } : query,
  );
  return updated;
}

async function updateVote(query: DataQuery, voteType: VoteType): Promise<void> {
  if (!query.id) {
    return;
  }
  try {
    const updated = await voteQuery(query.id, voteType);
    selectedQuery.value = selectedQuery.value?.id === updated.id ? updated : selectedQuery.value;
    queries.value = queries.value.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    );
  } catch {
    message.error(t('query.voteFailed'));
  }
}

// Pin afterDeleteAction: refetch with no arguments — page 1, current
// page size, no filters.
function afterDeleteAction(): void {
  void fetchQueries({ pageNumber: 1, dropFilters: true });
}

async function fetchTagOptions(searchText: string): Promise<QueryFilterOption[]> {
  try {
    const page = await searchAssets(
      buildFilterOptionsQuery(searchText, QUERY_TAG_FILTER),
      0,
      QUERY_FILTER_PAGE_SIZE,
      { index: 'tag' },
    );
    return page.hits.flatMap((hit) => {
      const key = hit.fullyQualifiedName ?? hit.name;
      if (!key) {
        return [];
      }
      return [{ key, label: hit.displayName || hit.name }];
    });
  } catch {
    return [];
  }
}

async function fetchOwnerOptions(searchText: string): Promise<QueryFilterOption[]> {
  try {
    const page = await searchAssets(
      buildFilterOptionsQuery(searchText, QUERY_OWNER_FILTER),
      0,
      QUERY_FILTER_PAGE_SIZE,
      { index: 'user,team' },
    );
    return page.hits.flatMap((hit) => {
      if (!hit.name) {
        return [];
      }
      return [{ key: hit.name, label: hit.displayName || hit.name }];
    });
  } catch {
    return [];
  }
}

function defaultOptions(
  selected: QueryFilterOption[],
  initial: QueryFilterOption[],
): QueryFilterOption[] {
  const seen = new Set<string>();
  return [...selected, ...initial].filter((option) => {
    if (seen.has(option.key)) {
      return false;
    }
    seen.add(option.key);
    return true;
  });
}

async function ensureInitialTagOptions(): Promise<void> {
  if (initialTagOptions.value.length > 0) {
    tagOptions.value = defaultOptions(selectedTags.value, initialTagOptions.value);
    return;
  }
  tagsLoading.value = true;
  try {
    const options = await fetchTagOptions('*');
    for (const option of options) {
      tagOptionsCache.set(option.key, option);
    }
    initialTagOptions.value = options;
    tagOptions.value = defaultOptions(selectedTags.value, options);
  } finally {
    tagsLoading.value = false;
  }
}

async function ensureInitialOwnerOptions(): Promise<void> {
  if (initialOwnerOptions.value.length > 0) {
    ownerOptions.value = defaultOptions(selectedOwners.value, initialOwnerOptions.value);
    return;
  }
  ownersLoading.value = true;
  try {
    const options = await fetchOwnerOptions('*');
    for (const option of options) {
      ownerOptionsCache.set(option.key, option);
    }
    initialOwnerOptions.value = options;
    ownerOptions.value = defaultOptions(selectedOwners.value, options);
  } finally {
    ownersLoading.value = false;
  }
}

async function onTagSearch(searchText: string): Promise<void> {
  if (!searchText) {
    tagOptions.value = defaultOptions(selectedTags.value, initialTagOptions.value);
    return;
  }
  tagsLoading.value = true;
  try {
    const options = await fetchTagOptions(searchText);
    for (const option of options) {
      tagOptionsCache.set(option.key, option);
    }
    tagOptions.value = options;
  } finally {
    tagsLoading.value = false;
  }
}

async function onOwnerSearch(searchText: string): Promise<void> {
  if (!searchText) {
    ownerOptions.value = defaultOptions(selectedOwners.value, initialOwnerOptions.value);
    return;
  }
  ownersLoading.value = true;
  try {
    const options = await fetchOwnerOptions(searchText);
    for (const option of options) {
      ownerOptionsCache.set(option.key, option);
    }
    ownerOptions.value = options;
  } finally {
    ownersLoading.value = false;
  }
}

// Pin filter/sort handlers pass only some of the current filter set
// (tag/date/sort changes drop owners) — a stale-state inconsistency,
// not intended behavior. The fork passes the full current set on every
// filter/sort change; only the paging handler drops filters, as the
// pin writes it.
// antd Select emits SelectValue (raw values or labeled values, single or
// array); these filters use plain string keys from the option caches.
function toSelectedKeys(value: SelectValue): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.flatMap((entry) => {
    const raw =
      typeof entry === 'object' && entry !== null ? (entry as { value?: unknown }).value : entry;
    return typeof raw === 'string' || typeof raw === 'number' ? [String(raw)] : [];
  });
}

function onTagFilterChange(value: SelectValue): void {
  selectedTags.value = toSelectedKeys(value).flatMap((key) => {
    const option = tagOptionsCache.get(key);
    return option ? [option] : [];
  });
  void fetchQueries({ pageNumber: 1 });
}

function onOwnerFilterChange(value: SelectValue): void {
  selectedOwners.value = toSelectedKeys(value).flatMap((key) => {
    const option = ownerOptionsCache.get(key);
    return option ? [option] : [];
  });
  void fetchQueries({ pageNumber: 1 });
}

function onDateChange(dates: unknown): void {
  const pair = Array.isArray(dates) ? (dates as Array<{ valueOf: () => number } | null>) : null;
  const start = pair?.[0];
  const end = pair?.[1];
  if (start && end) {
    const startTs = dayjs(start.valueOf()).startOf('day').valueOf();
    const endTs = dayjs(end.valueOf()).endOf('day').valueOf();
    timeRange.value = { startTs, endTs };
    rangeValue.value = [dayjs(startTs), dayjs(endTs)];
  } else {
    timeRange.value = undefined;
    rangeValue.value = null;
  }
  void fetchQueries({ pageNumber: 1 });
}

function onSortFieldChange(value: SelectValue): void {
  const single = Array.isArray(value) ? value[0] : value;
  const raw =
    typeof single === 'object' && single !== null ? (single as { value?: unknown }).value : single;
  if (raw === 'queryDate' || raw === 'updatedAt' || raw === 'totalVotes') {
    void fetchQueries({ pageNumber: 1, sortField: raw });
  }
}

function onSortOrderChange(): void {
  const order: QuerySortOrder = sortOrder.value === 'asc' ? 'desc' : 'asc';
  void fetchQueries({ pageNumber: 1, sortOrder: order });
}

// Pin pagingHandler: the refetch carries only the new page/size — the
// active tag/owner/date filters are dropped from the request while the
// filter controls keep showing them. Preserved as written.
function onPaging(page: number, size: number): void {
  void fetchQueries({ pageNumber: page, pageSize: size, dropFilters: true });
}

function onAddQuery(): void {
  void router.push({ name: 'query-add', params: { fqn: props.datasetFqn } });
}

onMounted(async () => {
  if (props.isTableDeleted || !props.tableId) {
    pageLoading.value = false;
    return;
  }
  const [tableOps, resourceOps] = await Promise.all([
    permissionStore.getEntityPermissionById('table', props.tableId).catch(() => null),
    permissionStore.getResourcePermission('query').catch(() => null),
  ]);
  if (tableOps === null) {
    message.error(t('query.fetchPermissionsError'));
    denied.value = true;
    pageLoading.value = false;
    return;
  }
  canCreate.value = resourceOps?.Create === true;
  if (!getDerivedPermissionFlags(tableOps).can('ViewQueries')) {
    denied.value = true;
    pageLoading.value = false;
    return;
  }
  await fetchQueries({ pageNumber: initialPage, pageSize: initialPageSize });
  pageLoading.value = false;
});
</script>

<style scoped>
.table-queries__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.table-queries__body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.table-queries__list {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.table-queries__body > :last-child {
  flex: 0 0 360px;
}

.table-queries__placeholder {
  padding: 24px 0;
  text-align: center;
}
</style>
