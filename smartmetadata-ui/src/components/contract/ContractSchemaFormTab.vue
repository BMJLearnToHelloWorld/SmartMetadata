<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractSchemaFormTab: paged columns, leaf-FQN-depth checkbox,
  preserve selected + removed columns across pages.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Table } from 'ant-design-vue';
import type { ContractColumn, DataContract } from '@/api/dataContracts';
import { getDataModelColumnsByFQN, getTableColumnsByFQN } from '@/api/columns';
import { apiRequest } from '@/api/client';
import { splitFqn } from '@/catalog/fqn';
import { SCHEMA_CHECKBOX_FQN_DEPTH } from '@/catalog/dataContractTabs';
import { flattenColumns, pruneEmptyChildren } from '@/catalog/dataContractForm';
import { getEncodedFqn } from '@/utils/fqnPaths';
import ContractFormStep from '@/components/contract/ContractFormStep.vue';

const props = defineProps<{
  entityType: string;
  entityFqn?: string;
  entityColumns?: ContractColumn[];
  selectedSchema?: ContractColumn[];
  nextLabel?: string;
  prevLabel?: string;
  isNextVisible?: boolean;
}>();

const emit = defineEmits<{
  change: [data: Partial<DataContract>];
  next: [];
  prev: [];
}>();

const { t } = useI18n();
const loading = ref(false);
const columnsData = ref<ContractColumn[]>([]);
const allColumnsData = ref<ContractColumn[]>([]);
const selectedKeys = ref<string[]>((props.selectedSchema ?? []).map((item) => item.fullyQualifiedName ?? ''));
const pageSize = 15;
const currentPage = ref(1);
const total = ref(0);

const checkboxDepth = computed(() => SCHEMA_CHECKBOX_FQN_DEPTH[props.entityType] ?? 3);

function uniqByFqn(items: ContractColumn[]): ContractColumn[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.fullyQualifiedName ?? item.name;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mapRawColumns(raw: unknown[]): ContractColumn[] {
  return raw.flatMap((item) => {
    const rec = item as Record<string, unknown>;
    const name = String(rec?.name ?? '');
    if (!name) {
      return [];
    }
    const children = Array.isArray(rec.children) ? mapRawColumns(rec.children) : undefined;
    return [{
      name,
      fullyQualifiedName: rec.fullyQualifiedName ? String(rec.fullyQualifiedName) : undefined,
      displayName: rec.displayName ? String(rec.displayName) : undefined,
      dataType: rec.dataType ? String(rec.dataType) : undefined,
      description: rec.description ? String(rec.description) : undefined,
      children,
    }];
  });
}

const oldRemovedColumns = computed(() => {
  const selected = props.selectedSchema ?? [];
  const present = new Set((props.entityColumns ?? []).map((col) => col.fullyQualifiedName));
  if (present.size === 0) {
    return [];
  }
  return selected.filter((col) => !present.has(col.fullyQualifiedName));
});

async function fetchColumns(page = 1): Promise<void> {
  const fqn = props.entityFqn;
  if (!fqn) {
    columnsData.value = pruneEmptyChildren(props.entityColumns ?? []);
    allColumnsData.value = uniqByFqn([
      ...allColumnsData.value,
      ...(props.selectedSchema ?? []),
      ...oldRemovedColumns.value,
      ...flattenColumns(columnsData.value),
    ]);
    return;
  }
  loading.value = true;
  try {
    const offset = (page - 1) * pageSize;
    let pageRows: ContractColumn[] = [];
    if (props.entityType === 'table') {
      const response = await getTableColumnsByFQN(fqn, { limit: pageSize, offset, fields: 'tags' });
      pageRows = mapRawColumns(response.data as unknown[]);
      total.value = Number(response.paging?.total ?? pageRows.length);
    } else if (props.entityType === 'dashboardDataModel') {
      const response = await getDataModelColumnsByFQN(fqn, { limit: pageSize, offset, fields: 'tags' });
      pageRows = mapRawColumns(response.data as unknown[]);
      total.value = Number(response.paging?.total ?? pageRows.length);
    } else if (props.entityType === 'topic') {
      const topic = await apiRequest<Record<string, unknown>>(`/v1/topics/name/${getEncodedFqn(fqn)}`, {
        query: { include: 'all' },
      });
      const schema = topic.messageSchema as Record<string, unknown> | undefined;
      pageRows = mapRawColumns((schema?.schemaFields as unknown[]) ?? []);
      total.value = pageRows.length;
    } else if (props.entityType === 'apiEndpoint') {
      const endpoint = await apiRequest<Record<string, unknown>>(`/v1/apiEndpoints/name/${getEncodedFqn(fqn)}`, {
        query: { include: 'all' },
      });
      const schema = endpoint.responseSchema as Record<string, unknown> | undefined;
      pageRows = mapRawColumns((schema?.schemaFields as unknown[]) ?? []);
      total.value = pageRows.length;
    }
    const pruned = pruneEmptyChildren(pageRows);
    const removed = pruneEmptyChildren(oldRemovedColumns.value);
    columnsData.value = offset === 0 ? [...removed, ...pruned] : pruned;
    allColumnsData.value = uniqByFqn([
      ...allColumnsData.value,
      ...(props.selectedSchema ?? []),
      ...removed,
      ...flattenColumns(pruned),
    ]);
  } finally {
    loading.value = false;
  }
}

function onSelectionChange(keys: (string | number)[]): void {
  const selectedRowKeys = keys.map(String);
  selectedKeys.value = selectedRowKeys;
  const selectedColumns = allColumnsData.value.filter((column) =>
    selectedRowKeys.includes(column.fullyQualifiedName ?? ''),
  );
  emit('change', { schema: selectedColumns });
}

function checkboxProps(record: ContractColumn): { disabled: boolean } {
  return {
    disabled: splitFqn(record.fullyQualifiedName ?? '').length !== checkboxDepth.value,
  };
}

function onPageChange(page: number): void {
  currentPage.value = page;
  void fetchColumns(page);
}

onMounted(() => {
  selectedKeys.value = (props.selectedSchema ?? []).map((item) => item.fullyQualifiedName ?? '');
  void fetchColumns(1);
});
</script>

<template>
  <ContractFormStep
    :title="t('label.schema')"
    :description="t('message.data-contract-schema-description')"
    :next-label="nextLabel"
    :prev-label="prevLabel"
    :is-next-visible="isNextVisible"
    show-prev
    @next="emit('next')"
    @prev="emit('prev')"
  >
    <Table
      row-key="fullyQualifiedName"
      :data-source="columnsData"
      :loading="loading"
      :pagination="entityType === 'table' || entityType === 'dashboardDataModel' ? { current: currentPage, pageSize, total, onChange: onPageChange } : false"
      :row-selection="{ selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: onSelectionChange, getCheckboxProps: checkboxProps }"
      :columns="[
        { title: t('label.name'), dataIndex: 'name', key: 'name' },
        { title: t('label.type'), dataIndex: 'dataType', key: 'dataType' },
        { title: t('label.description'), dataIndex: 'description', key: 'description' },
      ]"
      :default-expand-all-rows="true"
    />
  </ContractFormStep>
</template>
