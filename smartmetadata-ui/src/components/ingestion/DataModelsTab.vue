<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { message, Input, Switch } from 'ant-design-vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { listDataModels } from '@/api/dataModels';
import { buildSchemaQueryFilter, searchServiceIndex } from '@/api/serviceSearch';
import { SERVICE_CHILDREN_FIELDS } from '@/api/serviceChildren';
import { mapServicePageData } from '@/api/servicePageData';
import { assetLocation } from '@/catalog/entityRoutes';
import { PAGE_SIZE_BASE } from '@/catalog/servicePaging';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { useCursorPaging } from '@/ingestion/useCursorPaging';
import HighlightedText from './HighlightedText.vue';
import ServiceChildOwnersCell, { type CellOwnerRef } from './ServiceChildOwnersCell.vue';
import ServiceChildTagsCell, { type CellTagLabel } from './ServiceChildTagsCell.vue';
import ServiceChildrenPagination from './ServiceChildrenPagination.vue';
import {
  childTableEmptyText,
  compareChildNames,
  entityDisplayName,
  useDebouncedTableSearch,
  visibleChildTags,
  withRequiredFqn,
} from './serviceChildTable';

/**
 * Data Models tab for dashboard services, ported from official
 * components/Dashboard/DataModel/DataModels/DataModelsTable.tsx (pin
 * a3012259ca). Self-fetching with its own cursor paging: the list
 * effect watches pageSize/showDeleted/pagingCursor/searchValue, the
 * search effect watches searchValue/currentPage/showDeleted (no
 * pageSize dependency, as in pin). Search failures toast without
 * clearing the rows; list failures toast and reset to empty with a
 * zero-total paging object. The ShowDeleted switch resets the page
 * size to 15 (pin F9 quirk). Columns are pin's default visible set
 * (Name + Data Model Type + Description + Owners + Tags); Domain
 * and Data Products are defined in pin but hidden by default, and
 * the product table has no column-visibility mechanism (ADR-13).
 */
export interface DataModelRow {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName: string;
  dataModelType?: string;
  owners?: CellOwnerRef[];
  tags?: CellTagLabel[];
}

const props = defineProps<{
  serviceFqn: string;
  showDeleted: boolean;
  onShowDeletedChange: (checked: boolean) => void;
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const COMMON_TABLE_FIELDS = SERVICE_CHILDREN_FIELDS;

const {
  paging,
  currentPage,
  pageSize,
  pagingCursor,
  handlePageChange,
  handlePageSizeChange,
  handlePagingChange,
  showPagination,
} = useCursorPaging();

const rows = ref<DataModelRow[]>([]);
const isLoading = ref(true);

const searchValue = computed(() => {
  const value = route.query.dataModel;
  return typeof value === 'string' && value !== '' ? value : undefined;
});

async function fetchDataModels(cursor?: { after?: string; before?: string }): Promise<void> {
  isLoading.value = true;
  try {
    const response = await listDataModels({
      service: props.serviceFqn,
      limit: pageSize.value,
      include: props.showDeleted ? 'deleted' : 'non-deleted',
      fields: COMMON_TABLE_FIELDS,
      ...cursor,
    });
    rows.value = response.data.map(withRequiredFqn);
    handlePagingChange({
      total: response.total ?? 0,
      after: response.after,
      before: response.before,
    });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('shared.loadFailed'));
    rows.value = [];
    handlePagingChange({ total: 0 });
  } finally {
    isLoading.value = false;
  }
}

async function searchDataModels(value: string, pageNumber: number): Promise<void> {
  isLoading.value = true;
  try {
    const response = await searchServiceIndex({
      query: '',
      pageNumber,
      pageSize: pageSize.value,
      queryFilter: buildSchemaQueryFilter('service.fullyQualifiedName.keyword', props.serviceFqn, value),
      searchIndex: 'dashboardDataModel',
      includeDeleted: props.showDeleted,
      trackTotalHits: true,
    });
    rows.value = response.hits.flatMap((hit) => {
      const mapped = mapServicePageData(hit);
      return mapped ? [withRequiredFqn(mapped)] : [];
    });
    handlePagingChange({ total: response.total });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('shared.loadFailed'));
  } finally {
    isLoading.value = false;
  }
}

watch(
  [searchValue, currentPage, () => props.showDeleted],
  () => {
    if (searchValue.value) {
      void searchDataModels(searchValue.value, currentPage.value);
    }
  },
  { immediate: true },
);

watch(
  [pageSize, () => props.showDeleted, pagingCursor, searchValue],
  () => {
    if (searchValue.value) {
      return;
    }
    const { cursorType, cursorValue } = pagingCursor.value ?? {};
    if (cursorType && cursorValue) {
      void fetchDataModels({ [cursorType]: cursorValue });
    } else {
      void fetchDataModels();
    }
  },
  { immediate: true },
);

function handleDataModelPageChange(params: {
  currentPage: number;
  cursorType?: 'after' | 'before';
}): void {
  if (searchValue.value) {
    handlePageChange(params.currentPage);
  } else if (params.cursorType) {
    handlePageChange(
      params.currentPage,
      { cursorType: params.cursorType, cursorValue: paging.value[params.cursorType] },
      pageSize.value,
    );
  }
}

function onDataModelSearch(value: string): void {
  void router.replace({
    query: { ...route.query, dataModel: value === '' ? undefined : value },
  });
  handlePageChange(1, { cursorType: null, cursorValue: undefined });
}

function handleShowDeletedChange(checked: boolean): void {
  props.onShowDeletedChange(checked);
  handlePageChange(1, { cursorType: null, cursorValue: undefined }, PAGE_SIZE_BASE);
}

const inputValue = useDebouncedTableSearch(searchValue, onDataModelSearch);

const columns = computed(() => [
  {
    title: t('crud.name'),
    dataIndex: 'name',
    key: 'name',
    width: 300,
    sorter: compareChildNames,
  },
  { title: t('crud.description'), dataIndex: 'description', key: 'description', width: 400 },
  {
    title: t('serviceDetail.dataModels.type'),
    dataIndex: 'dataModelType',
    key: 'dataModelType',
    width: 200,
  },
  { title: t('explore.facets.owner'), dataIndex: 'owners', key: 'owners', width: 280 },
  { title: t('explore.facets.tagFqn'), dataIndex: 'tags', key: 'tags', width: 240 },
]);

const emptyText = computed(() =>
  childTableEmptyText(Boolean(searchValue.value), {
    noMatchingResults: t('serviceDetail.main.noMatchingResults'),
    checkSpelling: t('serviceDetail.main.checkSpelling'),
    noData: t('serviceDetail.main.noEntityDataAvailable', {
      entity: t('serviceDetail.dataModels.dataModels'),
    }),
  }),
);
</script>

<template>
  <div>
    <div class="data-models-tab__toolbar">
      <Input
        v-model:value="inputValue"
        class="data-models-tab__search"
        :placeholder="
          t('serviceDetail.main.searchForType', { type: t('serviceDetail.dataModels.dataModel') })
        "
        allow-clear
      />
      <span class="data-models-tab__deleted-toggle">
        <Switch
          :checked="showDeleted"
          size="small"
          data-testid="show-deleted"
          @change="(checked) => handleShowDeletedChange(Boolean(checked))"
        />
        <span>{{ t('crud.deleted') }}</span>
      </span>
    </div>
    <SmTable
      test-id="data-models-table"
      :columns="columns"
      :data-source="rows"
      row-key="id"
      size="small"
      :loading="isLoading"
      :pagination="false"
      :empty-text="emptyText"
    >
      <template #bodyCell="{ column, record, text }">
        <template v-if="column.key === 'name'">
          <RouterLink
            :to="assetLocation('dashboardDataModel', record.fullyQualifiedName)"
            :data-testid="`data-model-${entityDisplayName(record)}`"
          >
            <HighlightedText :text="entityDisplayName(record)" :search-text="searchValue" />
          </RouterLink>
        </template>
        <SmMarkdown
          v-else-if="column.key === 'description' && record.description"
          :markdown="record.description"
        />
        <ServiceChildOwnersCell
          v-else-if="column.key === 'owners'"
          :owners="record.owners ?? []"
        />
        <ServiceChildTagsCell
          v-else-if="column.key === 'tags'"
          :tags="visibleChildTags(record.tags ?? [])"
          :size-cap="3"
        />
        <template v-else>{{ text }}</template>
      </template>
    </SmTable>
    <ServiceChildrenPagination
      v-if="showPagination"
      :paging="paging"
      :current-page="currentPage"
      :page-size="pageSize"
      :is-number-based="Boolean(searchValue)"
      :is-loading="isLoading"
      @page-change="handleDataModelPageChange"
      @page-size-change="handlePageSizeChange"
    />
  </div>
</template>

<style scoped>
.data-models-tab__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.data-models-tab__search {
  width: 300px;
}

.data-models-tab__deleted-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
</style>
