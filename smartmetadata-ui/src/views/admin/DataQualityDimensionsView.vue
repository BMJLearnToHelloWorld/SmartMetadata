<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Data Quality Dimensions preference list (GET /v1/dataQuality/dimensions).
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Table, Tag } from 'ant-design-vue';
import { listDataQualityDimensions } from '@/api/dataQualityDimensions';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { DataQualityDimension } from '@/types/admin';

const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const rows = ref<DataQualityDimension[]>([]);

const columns = [
  { title: t('settings.dqDimensions.name'), dataIndex: 'name', key: 'name', width: 200 },
  { title: t('settings.dqDimensions.displayName'), dataIndex: 'displayName', key: 'displayName', width: 200 },
  { title: t('settings.dqDimensions.description'), dataIndex: 'description', key: 'description' },
  { title: t('settings.dqDimensions.provider'), dataIndex: 'provider', key: 'provider', width: 120 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listDataQualityDimensions({ limit: 100 });
    rows.value = page.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.dqDimensions.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PreferencePageShell
    test-id="dq-dimensions"
    :title="t('settings.dqDimensions.title')"
    :lead="t('settings.dqDimensions.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
    <Button style="margin-bottom: 12px" data-testid="dq-dimensions-refresh" @click="load">
      {{ t('settings.dqDimensions.refresh') }}
    </Button>
    <Table
      row-key="id"
      :columns="columns"
      :data-source="rows"
      :pagination="false"
      data-testid="dq-dimensions-table"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'provider'">
          <Tag>{{ (record as DataQualityDimension).provider || '—' }}</Tag>
        </template>
      </template>
    </Table>
  </PreferencePageShell>
</template>
