<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official OmHealthPage: GET /v1/system/status step validations.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Spin, Tag } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import { fetchSystemStatus } from '@/api/system';
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
import type { StepValidation, SystemValidationResponse } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.om-health');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.om-health');
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
const status = ref<SystemValidationResponse | null>(null);

interface Row {
  key: string;
  label: string;
  step?: StepValidation;
}

const rows = computed<Row[]>(() => {
  const s = status.value;
  if (!s) return [];
  return [
    { key: 'database', label: t('settings.health.database'), step: s.database },
    { key: 'searchInstance', label: t('settings.health.search'), step: s.searchInstance },
    { key: 'pipelineServiceClient', label: t('settings.health.pipeline'), step: s.pipelineServiceClient },
    { key: 'jwks', label: t('settings.health.jwks'), step: s.jwks },
    { key: 'migrations', label: t('settings.health.migrations'), step: s.migrations },
    { key: 'logStorage', label: t('settings.health.logStorage'), step: s.logStorage },
  ].filter((row) => row.step != null);
});

const columns = [
  { title: 'Check', dataIndex: 'label', key: 'label', width: 220 },
  { title: 'Status', key: 'passed', width: 120 },
  { title: 'Detail', key: 'detail' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    status.value = await fetchSystemStatus();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.health.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="om-health">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="om-health"
    />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Button style="margin-bottom: 12px" data-testid="om-health-refresh" @click="load">
        {{ t('settings.health.refresh') }}
      </Button>
      <SmTable row-key="key" :columns="columns" :data-source="rows" :pagination="false" test-id="om-health-table">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'passed'">
            <Tag :color="(record as Row).step?.passed ? 'success' : 'error'">
              {{ (record as Row).step?.passed ? t('settings.health.passed') : t('settings.health.failed') }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'detail'">
            {{ (record as Row).step?.message || (record as Row).step?.description || '—' }}
          </template>
        </template>
      </SmTable>
    </Spin>
  </div>
</template>
