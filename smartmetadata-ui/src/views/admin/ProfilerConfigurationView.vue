<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ProfilerConfigurationPage: metricConfiguration list + save.
  Job execution UI is Partial — config CRUD only (BehaviorMatched for fields).
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {Button, Form, Input, Select, Space, Switch, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import { getTypedSetting, settingAsProfiler, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import { PROFILER_DATA_TYPES, PROFILER_METRICS } from '@/quality/profilerConfig';
import type { MetricConfigurationDefinition, ProfilerConfiguration } from '@/types/admin';

const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const form = reactive<{
  metrics: MetricConfigurationDefinition[];
  storeSampleData: boolean;
  readSampleData: boolean;
}>({ metrics: [], storeSampleData: false, readSampleData: false });

/** Official ProfilerConfigurationPage coupling: storing sample data implies reading it. */
function onStoreSampleData(checked: boolean): void {
  form.storeSampleData = checked;
  if (checked) {
    form.readSampleData = true;
  }
}

const DATA_TYPES = [...PROFILER_DATA_TYPES];
const METRICS = [...PROFILER_METRICS];

const columns = [
  { title: t('settings.profiler.dataType'), key: 'dataType', width: 220 },
  { title: t('settings.profiler.metrics'), key: 'metrics' },
  { title: t('settings.profiler.disabled'), key: 'disabled', width: 140 },
  { title: '', key: 'actions', width: 100 },
];

function blankRow(): MetricConfigurationDefinition {
  return { dataType: undefined, metrics: [], disabled: false };
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const cfg = await getTypedSetting('profilerConfiguration', settingAsProfiler);
    form.metrics = [...(cfg.metricConfiguration ?? [])];
    form.storeSampleData = cfg.sampleDataConfig?.storeSampleData === true;
    form.readSampleData = cfg.sampleDataConfig?.readSampleData === true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.profiler.loadFailed');
  } finally {
    loading.value = false;
  }
}

function addRow(): void {
  form.metrics.push(blankRow());
}

function removeRow(index: number): void {
  form.metrics.splice(index, 1);
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const payload: ProfilerConfiguration = {
      metricConfiguration: form.metrics.map((row) => ({
        dataType: row.dataType,
        metrics: row.metrics ?? [],
        disabled: Boolean(row.disabled),
      })),
      // Previously omitted: saving dropped the server's sampleDataConfig.
      sampleDataConfig: {
        storeSampleData: form.storeSampleData,
        readSampleData: form.readSampleData,
      },
    };
    await updateSetting('profilerConfiguration', payload);
    message.success(t('settings.profiler.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.profiler.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PreferencePageShell
    test-id="profiler-configuration"
    :title="t('settings.profiler.title')"
    :lead="t('settings.profiler.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
    <Space style="margin-bottom: 12px">
      <Button data-testid="profiler-add-row" @click="addRow">{{ t('settings.profiler.add') }}</Button>
      <Button type="primary" :loading="saving" data-testid="profiler-save" @click="save">
        {{ t('settings.profiler.save') }}
      </Button>
    </Space>
    <SmTable
      row-key="__idx"
      :columns="columns"
      :data-source="form.metrics.map((row, index) => ({ ...row, __idx: index }))"
      :pagination="false"
      test-id="profiler-metrics-table"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'dataType'">
          <Select
            v-model:value="form.metrics[(record as { __idx: number }).__idx].dataType"
            style="width: 100%"
            :options="DATA_TYPES.map((value) => ({ value, label: value }))"
            :data-testid="`profiler-datatype-${(record as { __idx: number }).__idx}`"
          />
        </template>
        <template v-else-if="column.key === 'metrics'">
          <Select
            v-model:value="form.metrics[(record as { __idx: number }).__idx].metrics"
            mode="multiple"
            style="width: 100%"
            :options="METRICS.map((value) => ({ value, label: value }))"
            :data-testid="`profiler-metrics-${(record as { __idx: number }).__idx}`"
          />
        </template>
        <template v-else-if="column.key === 'disabled'">
          <Select
            v-model:value="form.metrics[(record as { __idx: number }).__idx].disabled"
            style="width: 100%"
            :options="[
              { value: false, label: t('settings.profiler.enabled') },
              { value: true, label: t('settings.profiler.disabledYes') },
            ]"
          />
        </template>
        <template v-else-if="column.key === 'actions'">
          <Button type="link" danger @click="removeRow((record as { __idx: number }).__idx)">
            {{ t('settings.profiler.remove') }}
          </Button>
        </template>
      </template>
    </SmTable>
    <Form layout="vertical" style="margin-top: 16px">
      <Form.Item :label="t('settings.profiler.storeSampleData')">
        <Switch v-model:checked="form.storeSampleData" data-testid="profiler-store-sample-data" @change="onStoreSampleData" />
      </Form.Item>
      <Form.Item :label="t('settings.profiler.readSampleData')">
        <Switch v-model:checked="form.readSampleData" data-testid="profiler-read-sample-data" />
      </Form.Item>
    </Form>
  </PreferencePageShell>
</template>
