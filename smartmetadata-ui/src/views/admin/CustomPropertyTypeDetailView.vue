<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Descriptions, Table } from 'ant-design-vue';
import { listCustomProperties } from '@/api/customProperties';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import type { EntityBreadcrumb, EntityListColumn } from '@/features/crud/types';
import type { CustomPropertyDef } from '@/types/collaboration';

const props = defineProps<{ entityType: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const definitions = ref<CustomPropertyDef[]>([]);

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('settings.customProperties.title'), to: { name: 'admin-settings-custom-properties' } },
  { label: props.entityType },
]);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('settings.customProperties.displayName'), dataIndex: 'displayName', key: 'displayName' },
  { title: t('settings.customProperties.propertyType'), dataIndex: 'propertyType', key: 'propertyType' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    definitions.value = await listCustomProperties(props.entityType);
  } catch (error) {
    definitions.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(
  () => props.entityType,
  () => {
    void load();
  },
);
</script>

<template>
  <EntityDetailShell
    :title="entityType"
    :lead="t('settings.customProperties.detailLead', { type: entityType })"
    :loading="loading"
    :error="errorMessage"
    :empty="!loading && !errorMessage && definitions.length === 0"
    :breadcrumbs="breadcrumbs"
  >
    <template v-if="definitions.length">
      <Descriptions bordered :column="1" size="small" style="margin-bottom: 16px">
        <Descriptions.Item :label="t('crud.type')">{{ entityType }}</Descriptions.Item>
        <Descriptions.Item :label="t('settings.customProperties.definitions')">
          {{ definitions.length }}
        </Descriptions.Item>
      </Descriptions>
      <Table
        row-key="name"
        data-testid="admin-custom-property-defs-table"
        :columns="columns"
        :data-source="definitions"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'displayName'">
            {{ (record as CustomPropertyDef).displayName || '—' }}
          </template>
          <template v-else-if="column.key === 'propertyType'">
            {{ (record as CustomPropertyDef).propertyType || '—' }}
          </template>
          <template v-else-if="column.key === 'description'">
            {{ (record as CustomPropertyDef).description || '—' }}
          </template>
        </template>
      </Table>
    </template>
  </EntityDetailShell>
</template>
