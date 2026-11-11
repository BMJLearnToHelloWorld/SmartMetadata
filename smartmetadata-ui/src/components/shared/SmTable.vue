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
    /** Legacy object prop kept for existing callers; antd Table has no
     *  `expandable` prop, so expansion below uses the top-level props. */
    expandable?: TableProps['expandable'];
    /** Row expansion, top-level antd Table props (the `expandable`
     *  object is not an antd prop — verified against ant-design-vue
     *  4.2.6; passing it silently drops the expansion). */
    expandedRowKeys?: TableProps['expandedRowKeys'];
    expandedRowRender?: TableProps['expandedRowRender'];
    expandIcon?: TableProps['expandIcon'];
    rowExpandable?: TableProps['rowExpandable'];
    /** Antd Table onExpand prop (expanded, record); SmTable otherwise has no
     *  expansion hook — the `expandable` object prop is not an antd prop. */
    onExpand?: (expanded: boolean, record: unknown) => void;
    loading?: boolean;
    pagination?: TableProps['pagination'];
    customRow?: TableProps['customRow'];
    size?: TableProps['size'];
    emptyText?: string;
    testId?: string;
    rowSelection?: TableProps['rowSelection'];
    /** Antd Table onChange passthrough (pagination / filters / sorter) for server-driven tables. */
    onChange?: TableProps['onChange'];
  }>(),
  {
    rowKey: 'id',
    expandable: undefined,
    expandedRowKeys: undefined,
    expandedRowRender: undefined,
    expandIcon: undefined,
    rowExpandable: undefined,
    onExpand: undefined,
    loading: false,
    pagination: undefined,
    customRow: undefined,
    size: undefined,
    emptyText: undefined,
    testId: 'sm-table',
    rowSelection: undefined,
    onChange: undefined,
  },
);
</script>

<template>
  <Table
    :data-testid="testId"
    :columns="columns"
    :data-source="dataSource"
    :row-key="rowKey"
    :expandable="expandable"
    :expanded-row-keys="expandedRowKeys"
    :expanded-row-render="expandedRowRender"
    :expand-icon="expandIcon"
    :row-expandable="rowExpandable"
    :on-expand="onExpand"
    :loading="loading"
    :pagination="pagination"
    :custom-row="customRow"
    :row-selection="rowSelection"
    :size="size"
    :on-change="onChange"
    :locale="emptyText ? { emptyText } : undefined"
  >
    <!-- Only forward bodyCell when a caller provides it; an empty slot would
         blank the default rendering that plain dataIndex columns rely on. -->
    <template v-if="$slots.bodyCell" #bodyCell="slotProps">
      <slot name="bodyCell" v-bind="slotProps" />
    </template>
  </Table>
</template>
