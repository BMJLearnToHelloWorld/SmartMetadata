<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { InputSearch, Table, Tooltip } from 'ant-design-vue';
import type { ChangeField } from '@/api/entities';
import VersionDiffText from '@/components/ingestion/VersionDiffText.vue';
import type { TagLabelWithStatus, TextDiffResult, VersionColumn } from '@/ingestion/versionDiff';
import type { ColumnJoins, TagRef } from '@/types/api';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import { NO_DATA_PLACEHOLDER } from '@/utils/notifications/alertConstants';

const props = defineProps<{
  columns?: VersionColumn[];
  isLoading?: boolean;
  joins?: ColumnJoins[];
  tableConstraints?: { columns?: string[]; constraintType?: string }[];
  addedColumnConstraintDiffs?: ChangeField[];
  deletedColumnConstraintDiffs?: ChangeField[];
  addedTableConstraintDiffs?: ChangeField[];
  deletedTableConstraintDiffs?: ChangeField[];
  columnName?: string;
}>();

const { t } = useI18n();
const searchText = ref('');
const currentPage = ref(1);
const pageSize = ref(10);

function matches(column: VersionColumn, query: string): boolean {
  const haystack = [column.name, column.displayName, column.dataTypeDisplay, column.dataType, column.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (haystack.includes(query)) {
    return true;
  }
  return Boolean(column.children?.some((child) => matches(child, query)));
}

function filterColumns(columns: VersionColumn[], query: string): VersionColumn[] {
  if (!query) {
    return columns;
  }
  return columns.reduce<VersionColumn[]>((acc, column) => {
    if (matches(column, query)) {
      const children = column.children ? filterColumns(column.children, query) : undefined;
      acc.push({ ...column, children: children?.length ? children : column.children });
    }
    return acc;
  }, []);
}

const filtered = computed(() => filterColumns(props.columns ?? [], searchText.value.trim().toLowerCase()));

watch(filtered, (rows) => {
  const maxPage = Math.max(1, Math.ceil(rows.length / pageSize.value));
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage;
  }
});

const displayData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

function fieldName(diff: ChangeField): string {
  return (diff as ChangeField & { name?: string }).field || (diff as ChangeField & { name?: string }).name || '';
}

function constraintFor(record: VersionColumn): string {
  const added = props.addedColumnConstraintDiffs?.find((diff) => fieldName(diff).includes(record.name));
  const deleted = props.deletedColumnConstraintDiffs?.find((diff) => fieldName(diff).includes(record.name));
  const addedValue = added ? String(added.newValue ?? '') : '';
  const deletedValue = deleted ? String(deleted.oldValue ?? '') : '';
  const current = record.constraint || '';
  return [deletedValue, addedValue || current].filter(Boolean).join(' ');
}

function classificationTags(tags: TagLabelWithStatus[] | TagRef[] | undefined): TagLabelWithStatus[] {
  return (tags ?? []).filter((tag) => (tag as TagRef).source !== 'Glossary');
}

function glossaryTags(tags: TagLabelWithStatus[] | TagRef[] | undefined): TagLabelWithStatus[] {
  return (tags ?? []).filter((tag) => (tag as TagRef).source === 'Glossary');
}

function tagClass(tag: TagLabelWithStatus): string {
  if (tag.added) {
    return 'version-table__tag--added';
  }
  if (tag.removed) {
    return 'version-table__tag--removed';
  }
  return '';
}

function textOrDiff(diff: TextDiffResult | undefined, text?: string): TextDiffResult {
  return diff ?? { type: 'plain', text: text ?? '' };
}

function joinedColumns(record: VersionColumn): string[] {
  if (!props.columnName || props.columnName !== record.name) {
    return [];
  }
  const match = props.joins?.find((join) => join.columnName === record.name);
  return (match?.joinedWith ?? []).map((item) => item.fullyQualifiedName).filter(Boolean);
}

const tableColumns = computed(() => [
  {
    title: t('label.name'),
    dataIndex: 'name',
    key: 'name',
    width: 200,
  },
  {
    title: t('label.type'),
    dataIndex: 'dataTypeDisplay',
    key: 'dataTypeDisplay',
    width: 200,
    ellipsis: true,
  },
  {
    title: t('label.description'),
    dataIndex: 'description',
    key: 'description',
    width: 400,
  },
  {
    title: t('label.tag-plural'),
    dataIndex: 'tags',
    key: 'tags',
    width: 272,
  },
  {
    title: t('label.glossary-term-plural'),
    dataIndex: 'glossary',
    key: 'glossary',
    width: 272,
  },
]);

function onSearch(value: string) {
  searchText.value = value;
  currentPage.value = 1;
}

function onPageChange(page: number, size: number) {
  currentPage.value = page;
  pageSize.value = size;
}

function asColumn(record: unknown): VersionColumn {
  return record as VersionColumn;
}
</script>

<template>
  <div class="version-table">
    <InputSearch
      :placeholder="t('message.find-in-table')"
      :value="searchText"
      allow-clear
      data-testid="searchbar"
      style="max-width: 280px; margin-bottom: 12px"
      @search="onSearch"
      @change="(event: Event) => onSearch((event.target as HTMLInputElement).value)"
    />
    <Table
      :columns="tableColumns"
      :data-source="displayData"
      :loading="isLoading"
      :pagination="{
        current: currentPage,
        pageSize,
        total: filtered.length,
        showSizeChanger: true,
        onChange: onPageChange,
      }"
      :row-key="(record: VersionColumn) => record.fullyQualifiedName || record.key || record.name"
      :locale="{ emptyText: undefined }"
      data-testid="entity-table"
      size="small"
    >
      <template #emptyText>
        <NoSearchResultsPlaceholder data-testid="search-error-placeholder" />
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <div class="version-table__name">
            <span v-if="constraintFor(asColumn(record))" class="version-table__constraint">{{ constraintFor(asColumn(record)) }}</span>
            <VersionDiffText :diff="textOrDiff(record.nameDiff, record.name)" />
            <div v-if="record.displayName" class="version-table__display-name">
              <VersionDiffText :diff="textOrDiff(record.displayNameDiff, record.displayName)" />
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'dataTypeDisplay'">
          <Tooltip v-if="record.dataTypeDisplay || record.dataType" :title="(record.dataTypeDisplay || record.dataType || '').toLowerCase()">
            <VersionDiffText :diff="textOrDiff(record.dataTypeDisplayDiff, (record.dataTypeDisplay || record.dataType || '').toLowerCase())" />
          </Tooltip>
          <span v-else>{{ NO_DATA_PLACEHOLDER }}</span>
        </template>
        <template v-else-if="column.key === 'description'">
          <div data-testid="column-description-cell">
            <template v-if="record.description || record.descriptionDiff">
              <VersionDiffText :diff="textOrDiff(record.descriptionDiff, record.description)" />
            </template>
            <span v-else class="version-table__muted">{{ t('label.no-entity', { entity: t('label.description') }) }}</span>
            <div v-if="joinedColumns(asColumn(record)).length" class="version-table__joins">
              {{ t('label.frequently-joined-column-plural') }}:
              <span v-for="join in joinedColumns(asColumn(record))" :key="join">{{ join }}</span>
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'tags'">
          <span
            v-for="tag in classificationTags(record.tags)"
            :key="tag.tagFQN"
            :class="['version-table__tag', tagClass(tag)]"
          >
            {{ tag.displayName || tag.tagFQN }}
          </span>
        </template>
        <template v-else-if="column.key === 'glossary'">
          <span
            v-for="tag in glossaryTags(record.tags)"
            :key="tag.tagFQN"
            :class="['version-table__tag', tagClass(tag)]"
          >
            {{ tag.displayName || tag.tagFQN }}
          </span>
        </template>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.version-table__name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 80%;
}
.version-table__constraint {
  margin-right: 6px;
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.version-table__muted {
  color: var(--sm-text-tertiary);
}
.version-table__tag {
  display: inline-block;
  margin: 0 4px 4px 0;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--sm-row-hover-bg);
}
.version-table__tag--added {
  text-decoration: underline;
  color: var(--sm-color-success-text);
}
.version-table__tag--removed {
  text-decoration: line-through;
  color: var(--sm-text-tertiary);
}
.version-table__joins {
  margin-top: 6px;
  font-size: 12px;
}
</style>
