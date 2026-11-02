<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Table } from 'ant-design-vue';
import type { TableProps } from 'ant-design-vue';

/**
 * Shared table wrapper: every list page should go through this so
 * pagination, sorting and empty states stay consistent. Column and
 * data definitions stay with the calling page (data-driven, no
 * per-entity branches in here).
 */
withDefaults(
  defineProps<{
    columns: TableProps['columns'];
    dataSource: TableProps['dataSource'];
    rowKey?: TableProps['rowKey'];
    loading?: boolean;
    pagination?: TableProps['pagination'];
    customRow?: TableProps['customRow'];
    size?: TableProps['size'];
    emptyText?: string;
    testId?: string;
  }>(),
  {
    rowKey: 'id',
    loading: false,
    pagination: undefined,
    customRow: undefined,
    size: undefined,
    emptyText: undefined,
    testId: 'sm-table',
  },
);
</script>

<template>
  <Table
    :data-testid="testId"
    :columns="columns"
    :data-source="dataSource"
    :row-key="rowKey"
    :loading="loading"
    :pagination="pagination"
    :custom-row="customRow"
    :size="size"
    :locale="emptyText ? { emptyText } : undefined"
  >
    <!-- Only forward bodyCell when a caller provides it; an empty slot would
         blank the default rendering that plain dataIndex columns rely on. -->
    <template v-if="$slots.bodyCell" #bodyCell="slotProps">
      <slot name="bodyCell" v-bind="slotProps" />
    </template>
  </Table>
</template>
