<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Empty, Input, Space, Table, Typography } from 'ant-design-vue';
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
    emptyText?: string;
  }>(),
  {
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
    emptyText: '',
  },
);

const emit = defineEmits<{
  'update:searchValue': [value: string];
  search: [];
  refresh: [];
  next: [];
  prev: [];
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
</script>

<template>
  <Card data-testid="entity-list-shell">
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="entity-list__head">
        <div>
          <Typography.Title :level="4" data-testid="entity-list-title">{{ title }}</Typography.Title>
          <Typography.Paragraph v-if="lead" type="secondary" data-testid="entity-list-lead">
            {{ lead }}
          </Typography.Paragraph>
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
        <Button data-testid="entity-list-refresh" @click="emit('refresh')">{{ t('crud.refresh') }}</Button>
      </Space>
      <Alert v-if="error" type="error" show-icon :message="error" data-testid="entity-list-error" />
      <Empty
        v-if="!loading && !error && dataSource.length === 0"
        :description="emptyDescription"
        data-testid="entity-list-empty"
      />
      <Table
        v-else
        :row-key="rowKey"
        :data-testid="tableTestId"
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="slotProps">
          <slot name="bodyCell" v-bind="slotProps" />
        </template>
      </Table>
      <div class="entity-list__footer">
        <Typography.Text type="secondary" data-testid="entity-list-count">{{ shownLabel }}</Typography.Text>
        <Space v-if="showPaging">
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
