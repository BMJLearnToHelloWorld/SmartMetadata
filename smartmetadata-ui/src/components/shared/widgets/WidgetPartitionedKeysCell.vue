<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SmTable from '@/components/shared/SmTable.vue';
import type { TablePartitionColumn } from '@/governance/tableWidgets';

/**
 * PartitionedKeys widget cell (D-2 batch 5a). Pin
 * `U/pages/TableDetailsPageV1/PartitionedKeys/PartitionedKeys.component.tsx:26`:
 * a small table of partition column name / interval type, `--` when the
 * type is missing; empty removes the widget (pin `filterWidgets`), so
 * this cell renders nothing without columns. Pin has no edit action
 * and no permission evaluation for this widget (BENCHMARK D-5a-1).
 */
const props = defineProps<{
  columns?: TablePartitionColumn[];
}>();

const { t } = useI18n();

const rows = computed(() =>
  (props.columns ?? []).map((column) => ({
    key: column.columnName,
    columnName: column.columnName,
    intervalType: column.intervalType ?? '--',
  })),
);

const columns = computed(() => [
  { title: t('asset.partitionColumn'), dataIndex: 'columnName', key: 'columnName', width: '50%' },
  { title: t('asset.partitionType'), dataIndex: 'intervalType', key: 'intervalType', width: '50%' },
]);
</script>

<template>
  <div v-if="rows.length" data-testid="widget-partitioned-keys">
    <SmTable
      row-key="key"
      test-id="asset-partitioned-keys-table"
      :columns="columns"
      :data-source="rows"
      :pagination="false"
      size="small"
    />
  </div>
</template>
