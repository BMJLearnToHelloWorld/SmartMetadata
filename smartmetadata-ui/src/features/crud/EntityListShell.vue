<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Dropdown, Empty, Input, Menu, Space, Tooltip, Typography } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmIcon from '@/components/shared/SmIcon.vue';
import SmTable from '@/components/shared/SmTable.vue';
import type { EntityListColumn } from './types';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    title: string;
    lead?: string;
    loading?: boolean;
    error?: string;
    columns: EntityListColumn[];
    dataSource: unknown[];
    rowKey?: string;
    tableTestId: string;
    showSearch?: boolean;
    searchValue?: string;
    searchPlaceholder?: string;
    total?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
    /**
     * Infinite-scroll mode (G-20): when true, the footer shows a
     * "Load more" button instead of the prev/next pager. Additive only —
     * callers that do not opt in keep cursor paging.
     */
    showLoadMore?: boolean;
    hasMore?: boolean;
    loadingMore?: boolean;
    emptyText?: string;
    showRowActions?: boolean;
    showEditAction?: boolean;
    showDeleteAction?: boolean;
    /**
     * ADR:2026-11-07-context-center-permission-gates — per-row delete
     * predicate (e.g. memory delete needs owner-or-admin on top of the
     * resource Delete grant). When provided and false for a row, that
     * row's delete entry is hidden, matching official's conditional
     * render; without it, showDeleteAction alone decides.
     */
    rowCanDelete?: (record: unknown) => boolean;
    hideHeading?: boolean;
    isBeta?: boolean;
    learningPageId?: string;
    rowSelection?: import('ant-design-vue').TableProps['rowSelection'];
  }>(),
  {
    isBeta: false,
    learningPageId: undefined,
    lead: '',
    loading: false,
    error: '',
    rowKey: 'id',
    showSearch: false,
    searchValue: '',
    searchPlaceholder: '',
    total: undefined,
    hasNext: false,
    hasPrev: false,
    showLoadMore: false,
    hasMore: false,
    loadingMore: false,
    emptyText: '',
    showRowActions: false,
    showEditAction: false,
    showDeleteAction: false,
    rowCanDelete: undefined,
    hideHeading: false,
    rowSelection: undefined,
  },
);

const emit = defineEmits<{
  'update:searchValue': [value: string];
  search: [];
  refresh: [];
  next: [];
  prev: [];
  loadMore: [];
  view: [record: unknown];
  edit: [record: unknown];
  delete: [record: unknown];
}>();

const shownLabel = computed(() => {
  const shown = props.dataSource.length;
  if (props.total !== undefined) {
    return t('crud.shownOf', { shown, total: props.total });
  }
  return t('crud.shown', { shown });
});

const emptyDescription = computed(() => props.emptyText || t('crud.empty'));
const searchPlaceholder = computed(() => props.searchPlaceholder || t('crud.searchPlaceholder'));
const showPaging = computed(() => props.hasNext || props.hasPrev);
const tableColumns = computed<EntityListColumn[]>(() => {
  if (!props.showRowActions) {
    return props.columns;
  }
  return [...props.columns, { title: t('crud.actions'), key: 'rowActions', width: 64 }];
});
</script>

<template>
  <Card data-testid="entity-list-shell">
    <Space direction="vertical" size="middle" style="width: 100%">
      <div v-if="!hideHeading || $slots.actions" class="entity-list__head">
        <div v-if="!hideHeading">
          <PageHeader
            :header="title"
            :sub-header="lead || undefined"
            :is-beta="isBeta"
            :learning-page-id="learningPageId"
            test-id="entity-list"
          />
        </div>
        <div class="entity-list__actions">
          <slot name="actions" />
        </div>
      </div>
      <Space wrap>
        <Input.Search
          v-if="showSearch"
          :value="searchValue"
          :placeholder="searchPlaceholder"
          allow-clear
          data-testid="entity-list-search"
          style="width: 280px"
          @update:value="emit('update:searchValue', $event)"
          @search="emit('search')"
        />
        <slot name="filters" />
        <Tooltip :title="t('crud.refreshHelp')">
          <Button
            data-testid="entity-list-refresh"
            :aria-label="t('crud.refreshHelp')"
            @click="emit('refresh')"
          >
            {{ t('crud.refresh') }}
          </Button>
        </Tooltip>
      </Space>
      <Alert v-if="error" type="error" show-icon :message="error" data-testid="entity-list-error" />
      <Empty
        v-if="!loading && !error && dataSource.length === 0"
        data-testid="entity-list-empty"
      >
        <template #description>
          <div>{{ emptyDescription }}</div>
          <Typography.Text v-if="!emptyText" type="secondary">{{ t('crud.emptyHint') }}</Typography.Text>
        </template>
        <slot name="emptyExtra" />
      </Empty>
      <SmTable
        v-else
        :row-key="rowKey"
        :test-id="tableTestId"
        :columns="tableColumns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="false"
        :row-selection="rowSelection"
        size="small"
      >
        <template #bodyCell="slotProps">
          <template v-if="slotProps.column.key === 'rowActions'">
            <Dropdown :trigger="['click']">
              <Tooltip :title="t('crud.moreActions')" placement="topLeft">
                <Button
                  type="text"
                  :aria-label="t('crud.moreActions')"
                  :data-testid="`row-overflow-${(slotProps.record as { id?: string }).id ?? ''}`"
                >
                  <SmIcon icon-key="action-more" />
                </Button>
              </Tooltip>
              <template #overlay>
                <Menu>
                  <Menu.Item key="view" data-testid="row-overflow-view" @click="emit('view', slotProps.record)">
                    {{ t('crud.view') }}
                  </Menu.Item>
                  <Menu.Item
                    v-if="showEditAction"
                    key="edit"
                    data-testid="row-overflow-edit"
                    @click="emit('edit', slotProps.record)"
                  >
                    {{ t('crud.edit') }}
                  </Menu.Item>
                  <Menu.Item
                    v-if="showDeleteAction && (!rowCanDelete || rowCanDelete(slotProps.record))"
                    key="delete"
                    danger
                    data-testid="row-overflow-delete"
                    @click="emit('delete', slotProps.record)"
                  >
                    {{ t('crud.delete') }}
                  </Menu.Item>
                  <slot name="rowActions" :record="slotProps.record" />
                </Menu>
              </template>
            </Dropdown>
          </template>
          <slot v-else name="bodyCell" v-bind="slotProps" />
        </template>
      </SmTable>
      <div class="entity-list__footer">
        <Typography.Text type="secondary" data-testid="entity-list-count">{{ shownLabel }}</Typography.Text>
        <Space v-if="showLoadMore && hasMore">
          <Button
            data-testid="entity-list-load-more"
            :loading="loadingMore"
            @click="emit('loadMore')"
          >
            {{ t('crud.loadMore') }}
          </Button>
        </Space>
        <Space v-else-if="showPaging">
          <Button data-testid="entity-list-prev" :disabled="!hasPrev" @click="emit('prev')">
            {{ t('crud.previous') }}
          </Button>
          <Button data-testid="entity-list-next" :disabled="!hasNext" @click="emit('next')">
            {{ t('crud.next') }}
          </Button>
        </Space>
      </div>
    </Space>
  </Card>
</template>

<style scoped>
.entity-list__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.entity-list__actions {
  flex-shrink: 0;
}

.entity-list__footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
