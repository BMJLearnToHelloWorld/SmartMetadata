<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Alert, Input, Switch, Typography } from 'ant-design-vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { apiEndpointLocation, listApiEndpoints, type ApiEndpointRef } from '@/api/apiCollections';
import { searchAssets } from '@/api/search';
import { buildSchemaQueryFilter } from '@/catalog/searchFilters';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import SmTable from '@/components/shared/SmTable.vue';
import type { TableProps } from 'ant-design-vue';
import type { Paging, PagingHandlerParams } from '@/utils/pagination';

/**
 * APIEndpoints (pin pages/APICollectionPage/APIEndpointsTab.tsx): the
 * endpoints of an API collection. Self-fetches — REST list by default,
 * Elasticsearch search while a query is active — with show-deleted and
 * cursor/number paging. No permission evaluation and no write action in
 * pin (read + navigate only); rows link to the endpoint detail.
 */
const props = defineProps<{
  apiCollectionFqn: string;
  serviceFqn: string;
}>();

const { t } = useI18n();
const router = useRouter();

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 500;

const rows = ref<ApiEndpointRef[]>([]);
const loading = ref(false);
const error = ref('');
const paging = ref<Paging>({ total: 0 });
const currentPage = ref(1);
const showDeleted = ref(false);
const searchInput = ref('');
const searchValue = ref('');

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let fetchSeq = 0;

const columns: TableProps['columns'] = [
  {
    title: t('label.name'),
    dataIndex: 'name',
    key: 'name',
    width: 400,
    sorter: (a: unknown, b: unknown) =>
      String((a as ApiEndpointRef).name ?? '').localeCompare(String((b as ApiEndpointRef).name ?? '')),
  },
  {
    title: t('lists.requestMethod'),
    dataIndex: 'requestMethod',
    key: 'requestMethod',
  },
  { title: t('label.description'), dataIndex: 'description', key: 'description' },
];

function onSearchInput(value: string): void {
  searchInput.value = value;
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchValue.value = value.trim();
    currentPage.value = 1;
    paging.value = { total: 0 };
    void fetchEndpoints();
  }, SEARCH_DEBOUNCE_MS);
}

function onShowDeletedChange(value: boolean): void {
  showDeleted.value = value;
  currentPage.value = 1;
  paging.value = { total: 0 };
  void fetchEndpoints();
}

async function fetchEndpoints(cursor?: { cursorType: 'after' | 'before'; cursorValue?: string }): Promise<void> {
  const seq = ++fetchSeq;
  loading.value = true;
  error.value = '';
  try {
    if (searchValue.value) {
      const page = await searchAssets('', (currentPage.value - 1) * PAGE_SIZE, PAGE_SIZE, {
        index: 'api_endpoint',
        query_filter: buildSchemaQueryFilter('apiCollection.fullyQualifiedName', props.apiCollectionFqn, searchValue.value),
        deleted: showDeleted.value ? true : undefined,
      });
      if (seq !== fetchSeq) {
        return;
      }
      rows.value = page.hits.map((hit) => ({
        id: hit.id,
        name: hit.name,
        displayName: hit.displayName,
        fullyQualifiedName: hit.fullyQualifiedName,
        requestMethod: hit.requestMethod,
        description: hit.description,
      }));
      paging.value = { total: page.total };
    } else {
      const page = await listApiEndpoints({
        apiCollection: props.apiCollectionFqn,
        service: props.serviceFqn,
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
    void fetchEndpoints();
    return;
  }
  if (!cursorType) {
    void fetchEndpoints();
    return;
  }
  const cursorValue = cursorType === 'before' ? paging.value.before : paging.value.after;
  void fetchEndpoints({ cursorType, cursorValue });
}

function openEndpoint(row: ApiEndpointRef): void {
  void router.push(apiEndpointLocation(row));
}

onMounted(() => {
  void fetchEndpoints();
});

watch(
  () => [props.apiCollectionFqn, props.serviceFqn],
  () => {
    searchInput.value = '';
    searchValue.value = '';
    showDeleted.value = false;
    currentPage.value = 1;
    paging.value = { total: 0 };
    void fetchEndpoints();
  },
);

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});
</script>

<template>
  <div data-testid="api-endpoints-widget">
    <div class="lists-widget__toolbar">
      <Input
        :value="searchInput"
        data-testid="search-api-endpoints-input"
        class="lists-widget__search"
        :placeholder="t('label.search-for-type', { type: t('label.api-endpoint') })"
        @update:value="onSearchInput(String($event))"
      />
      <span class="lists-widget__toggle">
        <Switch :checked="showDeleted" data-testid="show-deleted" size="small" @change="onShowDeletedChange(Boolean($event))" />
        <Typography.Text>{{ t('lists.deleted') }}</Typography.Text>
      </span>
    </div>
    <Alert v-if="error" type="error" show-icon :message="error" class="lists-widget__alert" />
    <SmTable
      row-key="id"
      test-id="asset-api-endpoints-table"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="false"
      size="small"
      :empty-text="searchValue ? t('label.no-matching-result-plural') : t('lists.noEntityDataAvailable', { entity: t('label.api-endpoint-plural') })"
      :custom-row="(row: ApiEndpointRef) => ({ onClick: () => openEndpoint(row) })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <a href="#" :data-testid="(record as ApiEndpointRef).name" @click.prevent="openEndpoint(record as ApiEndpointRef)">
            {{ (record as ApiEndpointRef).displayName || (record as ApiEndpointRef).name }}
          </a>
        </template>
        <template v-else-if="column.key === 'requestMethod'">
          <Typography.Text>{{ (record as ApiEndpointRef).requestMethod || '—' }}</Typography.Text>
        </template>
        <template v-else-if="column.key === 'description'">
          <DescriptionCell :markdown="(record as ApiEndpointRef).description" />
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
.lists-widget__alert {
  margin-bottom: 12px;
}
.lists-widget__pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
