<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Space, Tooltip } from 'ant-design-vue';
import type { LineageGraphModel } from '@/lineage/graphModel';
import { impactEntityRows, impactRowsToCsv, type ImpactEntityRow } from '@/lineage/impact';

const props = defineProps<{
  model: LineageGraphModel | null;
  entityType: string;
  fqn: string;
}>();

const { t } = useI18n();

const rows = computed((): ImpactEntityRow[] => {
  if (!props.model) {
    return [];
  }
  const center = props.model.nodes.find((node) => node.id === props.model?.centerId);
  const centerRow = center
    ? [
        {
          key: 'center',
          name: center.name,
          displayName: center.displayName,
          fullyQualifiedName: center.fullyQualifiedName,
          entityType: center.entityType,
          direction: '' as const,
          depth: 0,
          fromEntity: '',
          toEntity: '',
        },
      ]
    : [];
  return [
    ...centerRow,
    ...impactEntityRows(props.model, 'upstream'),
    ...impactEntityRows(props.model, 'downstream'),
  ];
});

function downloadCsv(): void {
  const csv = impactRowsToCsv(rows.value);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lineage-${props.entityType}-${props.fqn.replace(/[^A-Za-z0-9_.-]/g, '_')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div data-testid="lineage-export-panel">
    <Space wrap align="center">
      <Button
        data-testid="lineage-export-csv"
        :disabled="rows.length === 0"
        @click="downloadCsv"
      >
        {{ t('lineage.exportCsv') }}
      </Button>
      <Tooltip :title="t('lineage.exportPngResidual')">
        <Button data-testid="lineage-export-png" disabled>
          {{ t('lineage.exportPng') }}
        </Button>
      </Tooltip>
    </Space>
    <Alert
      v-if="rows.length === 0"
      type="info"
      show-icon
      data-testid="lineage-export-empty"
      :message="t('lineage.exportCsvEmpty')"
    />
    <Alert
      type="info"
      show-icon
      data-testid="lineage-export-png-residual"
      :message="t('lineage.exportPngResidual')"
    />
  </div>
</template>
