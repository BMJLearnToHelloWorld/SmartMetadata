<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Table, Typography } from 'ant-design-vue';
import type { CustomPropertyDef } from '@/types/collaboration';

const props = defineProps<{
  defs: CustomPropertyDef[];
  values: Record<string, unknown>;
  error: string;
  entityType: string;
}>();

const { t } = useI18n();

const columns = computed(() => [
  { title: t('asset.columns.property'), key: 'property' },
  { title: t('asset.columns.propertyType'), dataIndex: 'propertyType', key: 'propertyType', width: 140 },
  { title: t('asset.columns.value'), key: 'value' },
]);

function extensionValue(name: string): string {
  const value = props.values[name];
  if (value === undefined || value === null) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}
</script>

<template>
  <div>
    <Typography.Paragraph type="secondary">
      {{ t('asset.customPropertiesLead', { type: entityType }) }}
    </Typography.Paragraph>
    <Alert v-if="error" type="warning" show-icon :message="error" class="detail__alert" />
    <Table
      row-key="name"
      data-testid="asset-custom-properties-table"
      :columns="columns"
      :data-source="defs"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'property'">
          {{ (record as CustomPropertyDef).displayName || (record as CustomPropertyDef).name }}
        </template>
        <template v-else-if="column.key === 'value'">
          {{ extensionValue((record as CustomPropertyDef).name) }}
        </template>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.detail__alert {
  margin-bottom: 16px;
}
</style>
