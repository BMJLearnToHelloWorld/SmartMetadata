<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LineageConfigPage: depth + layer + pipeline view mode, field
  ids root/<name>, focus tracking for the doc panel, Cancel + Save.
  The save payload spreads the stored config (D-TC1 option A, frozen);
  depth validation is official: required + min 0, no upper bound.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, InputNumber, Select, Space, message } from 'ant-design-vue';
import { getTypedSetting, settingAsLineage, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import { useShellConfigStore } from '@/stores/shellConfig';
import type { LineageSettings } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const shellConfig = useShellConfigStore();
const loading = ref(false);
const saving = ref(false);
// Official toFormValues maps a missing server value to empty: the form
// starts empty and stays empty when the load fails.
const form = reactive<LineageSettings>({});
// The loaded configuration in full, kept apart from the form: the save
// payload spreads it so fields the form does not edit survive the PUT.
// Null until a load succeeds.
const storedConfig = ref<LineageSettings | null>(null);
const saveAttempted = ref(false);
const touched = reactive(new Set<string>());
// Tracks the focused field for the doc panel. The ResizablePanels split
// layout is a shared-component dependency; until it lands, the focus
// handlers below keep the active-field state a drop-in.
const activeField = ref('');

type DepthField = 'upstreamDepth' | 'downstreamDepth';

const DEPTH_LABELS: Record<DepthField, string> = {
  upstreamDepth: 'settings.lineage.upstream',
  downstreamDepth: 'settings.lineage.downstream',
};

function applyLoaded(loaded: LineageSettings): void {
  storedConfig.value = loaded;
  form.upstreamDepth = loaded.upstreamDepth;
  form.downstreamDepth = loaded.downstreamDepth;
  form.lineageLayer = loaded.lineageLayer;
  form.pipelineViewMode = loaded.pipelineViewMode;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const loaded = await getTypedSetting('lineageSettings', settingAsLineage);
    applyLoaded(loaded);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.lineage.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function depthError(field: DepthField): string | null {
  const value = form[field];
  if (value == null || Number.isNaN(value)) {
    return t('settings.lineage.fieldRequired', { field: t(DEPTH_LABELS[field]) });
  }
  if (value < 0) {
    return t('settings.lineage.minZero', { field: t(DEPTH_LABELS[field]), min: 0 });
  }
  return null;
}

function showError(field: string): boolean {
  return saveAttempted.value || touched.has(field);
}

function onFieldFocus(field: string): void {
  activeField.value = `root/${field}`;
}

// ADR:2026-11-18-lineage-settings-save-preserves-unedited-fields
async function save(): Promise<void> {
  const stored = storedConfig.value;
  if (stored === null) {
    message.error(t('settings.lineage.loadFailed'));
    return;
  }
  saveAttempted.value = true;
  if (depthError('upstreamDepth') !== null || depthError('downstreamDepth') !== null) {
    return;
  }
  saving.value = true;
  try {
    const updated = await updateSetting('lineageSettings', {
      ...stored,
      upstreamDepth: form.upstreamDepth,
      downstreamDepth: form.downstreamDepth,
      lineageLayer: form.lineageLayer,
      pipelineViewMode: form.pipelineViewMode,
    });
    message.success(t('settings.lineage.saved'));
    const parsed = settingAsLineage(updated.configValue);
    applyLoaded(parsed);
    shellConfig.setLineageSettings(parsed);
    saveAttempted.value = false;
    touched.clear();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.lineage.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  router.back();
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
  >
    <Form layout="vertical">
      <Form.Item
        :label="t('settings.lineage.upstream')"
        required
        :validate-status="showError('upstreamDepth') && depthError('upstreamDepth') ? 'error' : ''"
        :help="showError('upstreamDepth') ? (depthError('upstreamDepth') ?? '') : ''"
      >
        <InputNumber
          v-model:value="form.upstreamDepth"
          :min="0"
          id="root/upstreamDepth"
          data-testid="field-upstream"
          @focus="onFieldFocus('upstreamDepth')"
          @blur="touched.add('upstreamDepth')"
        />
      </Form.Item>
      <Form.Item
        :label="t('settings.lineage.downstream')"
        required
        :validate-status="showError('downstreamDepth') && depthError('downstreamDepth') ? 'error' : ''"
        :help="showError('downstreamDepth') ? (depthError('downstreamDepth') ?? '') : ''"
      >
        <InputNumber
          v-model:value="form.downstreamDepth"
          :min="0"
          id="root/downstreamDepth"
          data-testid="field-downstream"
          @focus="onFieldFocus('downstreamDepth')"
          @blur="touched.add('downstreamDepth')"
        />
      </Form.Item>
      <Form.Item :label="t('settings.lineage.layer')">
        <Select
          v-model:value="form.lineageLayer"
          data-testid="field-lineage-layer"
          @focus="onFieldFocus('lineageLayer')"
        >
          <Select.Option value="EntityLineage">{{ t('settings.lineage.entityLineage') }}</Select.Option>
          <Select.Option value="ColumnLevelLineage">{{ t('settings.lineage.columnLineage') }}</Select.Option>
          <Select.Option value="DataObservability">{{ t('settings.lineage.dataObservability') }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('settings.lineage.pipelineMode')">
        <Select
          v-model:value="form.pipelineViewMode"
          data-testid="field-pipeline-view-mode"
          @focus="onFieldFocus('pipelineViewMode')"
        >
          <Select.Option value="Edge">{{ t('settings.lineage.edge') }}</Select.Option>
          <Select.Option value="Node">{{ t('settings.lineage.node') }}</Select.Option>
        </Select>
      </Form.Item>
      <Space>
        <Button data-testid="cancel-button" @click="cancel">
          {{ t('settings.lineage.cancel') }}
        </Button>
        <Button type="primary" :loading="saving" data-testid="save-button" @click="save">
          {{ t('settings.lineage.save') }}
        </Button>
      </Space>
    </Form>
  </PreferencePageShell>
</template>
