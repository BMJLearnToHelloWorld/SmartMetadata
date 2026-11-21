<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Alert, Input, Pagination, Switch, Typography } from 'ant-design-vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { listContainerChildren, type ContainerChildRow } from '@/api/containers';
import { assetLocation } from '@/catalog/entityRoutes';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import SmTable from '@/components/shared/SmTable.vue';
import type { TableProps } from 'ant-design-vue';

/**
 * ContainerChildren (pin
 * components/Container/ContainerChildren/ContainerChildren.tsx): the
 * children list of a container, shown when the container has no data
 * model (the ContainerWidget dataModel-empty branch). Self-fetches from
 * GET /v1/containers/name/{fqn}/children — never the parent's embedded
 * `children` refs. No permission evaluation in this branch (pin: the
 * ContainerWidget derivation only feeds the ContainerDataModel branch)
 * and no write action: rows link to the child container, plus search,
 * show-deleted and offset paging.
 */
const props = defineProps<{
  containerFqn: string;
}>();

const { t } = useI18n();
const router = useRouter();

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 500;

const rows = ref<ContainerChildRow[]>([]);
const loading = ref(false);
const error = ref('');
const total = ref(0);
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
      String((a as ContainerChildRow).name ?? '').localeCompare(String((b as ContainerChildRow).name ?? '')),
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
    void fetchChildren();
  }, SEARCH_DEBOUNCE_MS);
}

function onShowDeletedChange(value: boolean): void {
  showDeleted.value = value;
  currentPage.value = 1;
  void fetchChildren();
}

async function fetchChildren(): Promise<void> {
  const seq = ++fetchSeq;
  loading.value = true;
  error.value = '';
  try {
    const page = await listContainerChildren(props.containerFqn, {
      limit: PAGE_SIZE,
      offset: (currentPage.value - 1) * PAGE_SIZE,
      include: showDeleted.value ? 'deleted' : 'non-deleted',
      q: searchValue.value || undefined,
    });
    // Stale-response guard (pin ContainerChildren fetchTokenRef): only the
    // latest fetch may write state — a slower earlier response (typed
    // search, deleted toggle) must not overwrite newer results.
    if (seq !== fetchSeq) {
      return;
    }
    rows.value = page.data;
    total.value = page.total ?? page.data.length;
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

function onPageChange(page: number): void {
  currentPage.value = page;
  void fetchChildren();
}

function openChild(row: ContainerChildRow): void {
  void router.push(assetLocation('container', row.fullyQualifiedName ?? row.name));
}

onMounted(() => {
  void fetchChildren();
});

// Clear filters when navigating between containers (pin useEffect on the
// container FQN): a search query or Deleted toggle set on the previous
// container must not silently carry over to the next listing.
watch(
  () => props.containerFqn,
  () => {
    searchInput.value = '';
    searchValue.value = '';
    showDeleted.value = false;
    currentPage.value = 1;
    void fetchChildren();
  },
);

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});
</script>

<template>
  <div data-testid="container-children-widget">
    <div class="lists-widget__toolbar">
      <Input
        :value="searchInput"
        data-testid="search-containers-input"
        class="lists-widget__search"
        :placeholder="t('label.search-for-type', { type: t('label.container-plural') })"
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
      test-id="container-list-table"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="false"
      size="small"
      :empty-text="searchValue ? t('label.no-matching-result-plural') : t('lists.noEntityDataAvailable', { entity: t('label.container-plural') })"
      :custom-row="(row: ContainerChildRow) => ({ onClick: () => openChild(row) })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <a href="#" data-testid="container-name" @click.prevent="openChild(record as ContainerChildRow)">
            {{ (record as ContainerChildRow).displayName || (record as ContainerChildRow).name }}
          </a>
        </template>
        <template v-else-if="column.key === 'description'">
          <DescriptionCell :markdown="(record as ContainerChildRow).description" />
        </template>
      </template>
    </SmTable>
    <div v-if="total > PAGE_SIZE" class="lists-widget__pager">
      <Pagination
        size="small"
        :current="currentPage"
        :page-size="PAGE_SIZE"
        :total="total"
        :show-size-changer="false"
        @change="onPageChange"
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
