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
    testId?: string;
  }>(),
  { rowKey: 'id', loading: false, pagination: undefined, testId: 'sm-table' },
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
  />
</template>
