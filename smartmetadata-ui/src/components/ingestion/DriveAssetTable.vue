<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { message, Input, Switch } from 'ant-design-vue';
import { computed, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { buildSchemaQueryFilter, searchServiceIndex } from '@/api/serviceSearch';
import { mapServicePageData } from '@/api/servicePageData';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { useDriveAssets } from '@/ingestion/useDriveAssets';
import HighlightedText from './HighlightedText.vue';
import ServiceChildTagsCell from './ServiceChildTagsCell.vue';
import ServiceChildrenPagination from './ServiceChildrenPagination.vue';
import {
  childTableEmptyText,
  compareChildNames,
  entityDisplayName,
  useDebouncedTableSearch,
  visibleChildTags,
} from './serviceChildTable';

/**
 * Files / Spreadsheets tab for drive services, ported from official
 * components/DriveService/File/FilesTable/FilesTable.tsx (pin
 * a3012259ca), taking the FilesTable form (its search effect also
 * depends on pageSize). One parameterized component for both entity
 * types: pin's two tables differ in entity parameters, in whether
 * the search effect depends on pageSize, and in prop order, and
 * this component follows the FilesTable side of each difference.
 * The list and its paging live in `useDriveAssets`; the table owns
 * its search, which writes back into the hook's state. Row names do
 * not link: file/spreadsheet rows have no detail pages (Q6(b)). The
 * ShowDeleted switch resets the cursor without resetting the page
 * size (unlike DataModels, which carries pin's F9 quirk).
 */

const props = defineProps<{
  entityType: 'file' | 'spreadsheet';
  serviceFqn: string;
  showDeleted: boolean;
  onShowDeletedChange: (checked: boolean) => void;
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const { items, setItems, isLoading, setIsLoading, pagingInfo, onPageChange } = useDriveAssets(
  props.entityType,
  props.serviceFqn,
  toRef(props, 'showDeleted'),
);
const { paging, currentPage, pageSize, handlePageChange, handlePageSizeChange, handlePagingChange, showPagination } =
  pagingInfo;

const searchValue = computed(() => {
  const value = route.query[props.entityType];
  return typeof value === 'string' && value !== '' ? value : undefined;
});

async function searchDriveAssets(value: string, pageNumber: number): Promise<void> {
  setIsLoading(true);
  try {
    const response = await searchServiceIndex({
      query: '',
      pageNumber,
      pageSize: pageSize.value,
      queryFilter: buildSchemaQueryFilter('service.fullyQualifiedName.keyword', props.serviceFqn, value),
      searchIndex: props.entityType,
      includeDeleted: props.showDeleted,
      trackTotalHits: true,
    });
    setItems(
      response.hits.flatMap((hit) => {
        const row = mapServicePageData(hit);
        return row ? [row] : [];
      }),
    );
    handlePagingChange({ total: response.total });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('shared.loadFailed'));
  } finally {
    setIsLoading(false);
  }
}

watch(
  [searchValue, currentPage, pageSize, () => props.showDeleted],
  () => {
    if (searchValue.value) {
      void searchDriveAssets(searchValue.value, currentPage.value);
    }
  },
  { immediate: true },
);

function onDriveAssetSearch(value: string): void {
  void router.replace({
    query: { ...route.query, [props.entityType]: value === '' ? undefined : value },
  });
  handlePageChange(1, { cursorType: null, cursorValue: undefined });
}

function handleShowDeletedChange(checked: boolean): void {
  props.onShowDeletedChange(checked);
  handlePageChange(1, { cursorType: null, cursorValue: undefined });
}

const inputValue = useDebouncedTableSearch(searchValue, onDriveAssetSearch);

const tableTestId = computed(() => (props.entityType === 'file' ? 'files-table' : 'spreadsheets-table'));
const searchTypeLabel = computed(() =>
  props.entityType === 'file'
    ? t('serviceDetail.drive.file')
    : t('serviceDetail.drive.spreadsheet'),
);
const emptyEntityLabel = computed(() =>
  props.entityType === 'file'
    ? t('serviceDetail.drive.files')
    : t('serviceDetail.drive.spreadsheets'),
);

const columns = computed(() => [
  {
    title: t('crud.name'),
    dataIndex: 'name',
    key: 'name',
    width: 300,
    sorter: compareChildNames,
  },
  { title: t('crud.description'), dataIndex: 'description', key: 'description', width: 400 },
  { title: t('explore.facets.tagFqn'), dataIndex: 'tags', key: 'tags', width: 240 },
]);

const emptyText = computed(() =>
  childTableEmptyText(Boolean(searchValue.value), {
    noMatchingResults: t('serviceDetail.main.noMatchingResults'),
    checkSpelling: t('serviceDetail.main.checkSpelling'),
    noData: t('serviceDetail.main.noEntityDataAvailable', { entity: emptyEntityLabel.value }),
  }),
);
</script>

<template>
  <div>
    <div class="drive-asset-table__toolbar">
      <Input
        v-model:value="inputValue"
        class="drive-asset-table__search"
        :placeholder="t('serviceDetail.main.searchForType', { type: searchTypeLabel })"
        allow-clear
      />
      <span class="drive-asset-table__deleted-toggle">
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
      :test-id="tableTestId"
      :columns="columns"
      :data-source="items"
      row-key="id"
      size="small"
      :loading="isLoading"
      :pagination="false"
      :empty-text="emptyText"
    >
      <template #bodyCell="{ column, record, text }">
        <span v-if="column.key === 'name'" :data-testid="`${entityType}-${entityDisplayName(record)}`">
          <HighlightedText :text="entityDisplayName(record)" :search-text="searchValue" />
        </span>
        <SmMarkdown
          v-else-if="column.key === 'description' && record.description"
          :markdown="record.description"
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
      @page-change="onPageChange"
      @page-size-change="handlePageSizeChange"
    />
  </div>
</template>

<style scoped>
.drive-asset-table__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.drive-asset-table__search {
  width: 300px;
}

.drive-asset-table__deleted-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
</style>
