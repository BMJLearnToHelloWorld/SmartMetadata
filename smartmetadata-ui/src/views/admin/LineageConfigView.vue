<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LineageConfigPage: depth + layer + pipeline view mode.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, InputNumber, Select, message } from 'ant-design-vue';
import { getTypedSetting, settingAsLineage, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { LineageSettings } from '@/types/admin';

const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const form = reactive<LineageSettings>({
  upstreamDepth: 2,
  downstreamDepth: 2,
  lineageLayer: 'EntityLineage',
  pipelineViewMode: 'Node',
});

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    Object.assign(form, await getTypedSetting('lineageSettings', settingAsLineage));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.lineage.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('lineageSettings', {
      upstreamDepth: form.upstreamDepth,
      downstreamDepth: form.downstreamDepth,
      lineageLayer: form.lineageLayer,
      pipelineViewMode: form.pipelineViewMode,
    });
    message.success(t('settings.lineage.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.lineage.saveFailed'));
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
    test-id="lineage-config"
    :title="t('settings.lineage.title')"
    :lead="t('settings.lineage.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
    <Form layout="vertical">
      <Form.Item :label="t('settings.lineage.upstream')">
        <InputNumber v-model:value="form.upstreamDepth" :min="1" :max="5" data-testid="lineage-upstream" />
      </Form.Item>
      <Form.Item :label="t('settings.lineage.downstream')">
        <InputNumber v-model:value="form.downstreamDepth" :min="1" :max="5" data-testid="lineage-downstream" />
      </Form.Item>
      <Form.Item :label="t('settings.lineage.layer')">
        <Select v-model:value="form.lineageLayer" data-testid="lineage-layer">
          <Select.Option value="EntityLineage">{{ t('settings.lineage.entityLineage') }}</Select.Option>
          <Select.Option value="ColumnLevelLineage">{{ t('settings.lineage.columnLineage') }}</Select.Option>
          <Select.Option value="DataObservability">{{ t('settings.lineage.dataObservability') }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('settings.lineage.pipelineMode')">
        <Select v-model:value="form.pipelineViewMode" data-testid="lineage-pipeline-mode">
          <Select.Option value="Node">{{ t('settings.lineage.node') }}</Select.Option>
          <Select.Option value="Edge">{{ t('settings.lineage.edge') }}</Select.Option>
        </Select>
      </Form.Item>
      <Button type="primary" :loading="saving" data-testid="lineage-save" @click="save">
        {{ t('settings.lineage.save') }}
      </Button>
    </Form>
  </PreferencePageShell>
</template>
