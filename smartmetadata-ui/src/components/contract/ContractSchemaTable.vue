<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Table, Tag } from 'ant-design-vue';
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons-vue';
import type { ContractColumn, SchemaValidation } from '@/api/dataContracts';
import { LIST_SIZE } from '@/catalog/dataContractConstants';
import ContractConstraintStatus from './ContractConstraintStatus.vue';
import { NO_DATA_PLACEHOLDER } from '@/utils/dataContract';

const props = defineProps<{
  schemaDetail: ContractColumn[];
  contractStatus?: string;
  latestSchemaValidationResult?: SchemaValidation;
  entityType?: string;
}>();

const { t } = useI18n();

const columns = computed(() => {
  const cols: Array<Record<string, unknown>> = [
    { title: t('label.name'), dataIndex: 'name', key: 'name' },
    { title: t('label.type'), dataIndex: 'dataType', key: 'dataType' },
  ];
  if (props.entityType === 'table') {
    cols.push({ title: t('label.constraint-plural'), dataIndex: 'constraint', key: 'constraint' });
  }
  if (props.latestSchemaValidationResult) {
    cols.push({ title: t('label.column-status'), key: 'columnStatus', align: 'center' });
  }
  return cols;
});
</script>

<template>
  <div class="contract-schema-component-container">
    <Table
      :columns="columns"
      :data-source="schemaDetail"
      :pagination="{ pageSize: LIST_SIZE, hideOnSinglePage: true }"
      row-key="name"
      size="small"
    >
      <template #bodyCell="{ column, record, text }">
        <template v-if="column.key === 'name'">
          <span class="schema-name">{{ text }}</span>
        </template>
        <template v-else-if="column.key === 'dataType'">
          <Tag color="purple">{{ text }}</Tag>
        </template>
        <template v-else-if="column.key === 'constraint'">
          <Tag v-if="text" color="blue">{{ text }}</Tag>
          <span v-else data-testid="no-constraints">{{ NO_DATA_PLACEHOLDER }}</span>
        </template>
        <template v-else-if="column.key === 'columnStatus'">
          <CloseCircleFilled
            v-if="latestSchemaValidationResult?.failedFields?.includes(record.name)"
            class="column-status-icon is-failed"
            :data-testid="`schema-column-${record.name}-failed`"
          />
          <CheckCircleFilled
            v-else
            class="column-status-icon is-success"
            :data-testid="`schema-column-${record.name}-success`"
          />
        </template>
      </template>
    </Table>
    <div v-if="contractStatus" class="contract-status-container">
      <span class="contract-status-label">{{ t('label.entity-status', { entity: t('label.schema') }) }} :</span>
      <ContractConstraintStatus :status="contractStatus" test-id="contract-status-card-item-schema-status" />
    </div>
  </div>
</template>

<style scoped>
.contract-schema-component-container {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 20px;
  align-items: start;
}
.schema-name { color: var(--sm-brand); }
.column-status-icon.is-failed { color: var(--sm-color-error); }
.column-status-icon.is-success { color: var(--sm-color-success); }
.contract-status-container {
  display: flex;
  align-items: center;
  gap: 12px;
}
.contract-status-label { color: var(--sm-text-primary); }
</style>
