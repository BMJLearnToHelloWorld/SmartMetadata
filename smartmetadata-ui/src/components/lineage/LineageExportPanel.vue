<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Space } from 'ant-design-vue';
import type { LineageGraphModel } from '@/lineage/graphModel';
import { impactEntityRows, impactRowsToCsv, type ImpactEntityRow } from '@/lineage/impact';

const props = defineProps<{
  model: LineageGraphModel | null;
  entityType: string;
  fqn: string;
  pngAvailable: boolean;
  onExportPng: () => Promise<void>;
}>();

const { t } = useI18n();
const exportingPng = ref(false);

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

async function exportPng(): Promise<void> {
  if (exportingPng.value) {
    return;
  }
  exportingPng.value = true;
  try {
    await props.onExportPng();
  } finally {
    exportingPng.value = false;
  }
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
      <Button
        data-testid="lineage-export-png"
        :disabled="!pngAvailable"
        :loading="exportingPng"
        @click="exportPng"
      >
        {{ t('lineage.exportPng') }}
      </Button>
    </Space>
    <Alert
      v-if="rows.length === 0"
      type="info"
      show-icon
      data-testid="lineage-export-empty"
      :message="t('lineage.exportCsvEmpty')"
    />
  </div>
</template>
