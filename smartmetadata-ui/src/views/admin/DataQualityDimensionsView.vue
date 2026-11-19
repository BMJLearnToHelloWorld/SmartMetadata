<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Data Quality Dimensions preference list (GET /v1/dataQuality/dimensions).
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {Alert, Button, Spin, Tag} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import { listDataQualityDimensions } from '@/api/dataQualityDimensions';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, getSettingPageBreadcrumbs, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  registryDescription,
  type SettingsTranslator,
} from '@/settings/registry';
import type { DataQualityDimension } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.data-quality');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.data-quality');
}
const header = computed(() => registryTitle(settingsTranslator, registryEntry));
const subHeader = computed(() => registryDescription(settingsTranslator, registryEntry));
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      'preferences',
      registryTitle(settingsTranslator, registryEntry),
    ),
  ),
);
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
  <div data-testid="dq-dimensions">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="dq-dimensions"
    />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Button style="margin-bottom: 12px" data-testid="dq-dimensions-refresh" @click="load">
        {{ t('settings.dqDimensions.refresh') }}
      </Button>
      <SmTable
        row-key="id"
        :columns="columns"
        :data-source="rows"
        :pagination="false"
        test-id="dq-dimensions-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'provider'">
            <Tag>{{ (record as DataQualityDimension).provider || '—' }}</Tag>
          </template>
        </template>
      </SmTable>
    </Spin>
  </div>
</template>
