<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official OmHealthPage: GET /v1/system/status step validations.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Table, Tag } from 'ant-design-vue';
import { fetchSystemStatus } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { StepValidation, SystemValidationResponse } from '@/types/admin';

const { t } = useI18n();
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
  <PreferencePageShell
    test-id="om-health"
    :title="t('settings.health.title')"
    :lead="t('settings.health.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
    <Button style="margin-bottom: 12px" data-testid="om-health-refresh" @click="load">
      {{ t('settings.health.refresh') }}
    </Button>
    <Table row-key="key" :columns="columns" :data-source="rows" :pagination="false" data-testid="om-health-table">
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
    </Table>
  </PreferencePageShell>
</template>
