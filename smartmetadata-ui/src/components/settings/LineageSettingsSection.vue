<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Form, InputNumber, Select, Space, Spin, Typography, message } from 'ant-design-vue';
import { getTypedSetting, settingAsLineage, updateSetting } from '@/api/system';
import { useShellConfigStore } from '@/stores/shellConfig';
import type { LineageSettings } from '@/types/admin';

const { t } = useI18n();
const shellConfig = useShellConfigStore();

type DepthField = 'upstreamDepth' | 'downstreamDepth';
const DEPTH_LABELS: Record<DepthField, string> = {
  upstreamDepth: 'settings.lineage.upstream',
  downstreamDepth: 'settings.lineage.downstream',
};
const LAYER_LABELS: Record<string, string> = {
  EntityLineage: 'settings.lineage.entityLineage',
  ColumnLevelLineage: 'settings.lineage.columnLineage',
  DataObservability: 'settings.lineage.dataObservability',
};
const MODE_LABELS: Record<string, string> = {
  Edge: 'settings.lineage.edge',
  Node: 'settings.lineage.node',
};

const loading = ref(true);
const loadError = ref('');
const storedConfig = ref<LineageSettings | null>(null);
const editing = ref(false);
const saving = ref(false);
const saveAttempted = ref(false);
const form = reactive({
  upstreamDepth: undefined as number | undefined,
  downstreamDepth: undefined as number | undefined,
  lineageLayer: undefined as LineageSettings['lineageLayer'],
  pipelineViewMode: undefined as LineageSettings['pipelineViewMode'],
});

function applyLoaded(loaded: LineageSettings): void {
  storedConfig.value = loaded;
  form.upstreamDepth = loaded.upstreamDepth;
  form.downstreamDepth = loaded.downstreamDepth;
  form.lineageLayer = loaded.lineageLayer;
  form.pipelineViewMode = loaded.pipelineViewMode;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    applyLoaded(await getTypedSetting('lineageSettings', settingAsLineage));
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('settings.lineage.loadFailed');
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

function layerLabel(value: LineageSettings['lineageLayer']): string {
  return value ? t(LAYER_LABELS[value]) : '—';
}

function modeLabel(value: LineageSettings['pipelineViewMode']): string {
  return value ? t(MODE_LABELS[value]) : '—';
}

// ADR:2026-11-18-lineage-settings-save-preserves-unedited-fields — the
// settings PUT replaces the whole value, so the save spreads the stored
// config (graphPerformanceConfig survives) and never runs while the
// stored config failed to load.
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
    const parsed = settingAsLineage(updated.configValue);
    applyLoaded(parsed);
    shellConfig.setLineageSettings(parsed);
    message.success(t('settings.lineage.saved'));
    saveAttempted.value = false;
    editing.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.lineage.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  if (storedConfig.value) {
    applyLoaded(storedConfig.value);
  }
  saveAttempted.value = false;
  editing.value = false;
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card data-testid="platform-lineage-settings">
    <template #title>{{ t('settings.lineage.title') }}</template>
    <template #extra>
      <Button
        v-if="!editing && storedConfig"
        data-testid="platform-lineage-edit"
        @click="editing = true"
      >
        {{ t('label.edit') }}
      </Button>
    </template>
    <Typography.Paragraph type="secondary">{{ t('settings.lineage.description') }}</Typography.Paragraph>
    <Spin v-if="loading" data-testid="platform-lineage-loading" />
    <Alert
      v-else-if="loadError"
      type="error"
      show-icon
      data-testid="platform-lineage-load-error"
      :message="loadError"
    />
    <!-- Pin LineageSettings.tsx (a3012259ca): the read-only summary is
         four rows — upstream depth, downstream depth, lineage layer,
         pipeline view mode. The edit form is pin LineageSettingsForm.tsx:
         the same four fields, depths required non-negative (the product
         admin form's validation, mirrored here — no upper bound). -->
    <div v-else-if="!editing && storedConfig" class="lineage-settings__rows">
      <div class="lineage-settings__row">
        <Typography.Text type="secondary">{{ t('settings.lineage.upstream') }}</Typography.Text>
        <Typography.Text data-testid="upstream-depth-value">{{ storedConfig.upstreamDepth ?? '—' }}</Typography.Text>
      </div>
      <div class="lineage-settings__row">
        <Typography.Text type="secondary">{{ t('settings.lineage.downstream') }}</Typography.Text>
        <Typography.Text data-testid="downstream-depth-value">{{ storedConfig.downstreamDepth ?? '—' }}</Typography.Text>
      </div>
      <div class="lineage-settings__row">
        <Typography.Text type="secondary">{{ t('settings.lineage.layer') }}</Typography.Text>
        <Typography.Text data-testid="lineage-layer-value">{{ layerLabel(storedConfig.lineageLayer) }}</Typography.Text>
      </div>
      <div class="lineage-settings__row">
        <Typography.Text type="secondary">{{ t('settings.lineage.pipelineMode') }}</Typography.Text>
        <Typography.Text data-testid="pipeline-view-mode-value">{{ modeLabel(storedConfig.pipelineViewMode) }}</Typography.Text>
      </div>
    </div>
    <Form v-else-if="editing" layout="vertical" data-testid="platform-lineage-form">
      <Form.Item
        :label="t('settings.lineage.upstream')"
        :validate-status="saveAttempted && depthError('upstreamDepth') ? 'error' : undefined"
        :help="saveAttempted ? depthError('upstreamDepth') ?? undefined : undefined"
      >
        <InputNumber
          v-model:value="form.upstreamDepth"
          data-testid="field-upstream"
          :min="0"
          style="width: 100%"
        />
      </Form.Item>
      <Form.Item
        :label="t('settings.lineage.downstream')"
        :validate-status="saveAttempted && depthError('downstreamDepth') ? 'error' : undefined"
        :help="saveAttempted ? depthError('downstreamDepth') ?? undefined : undefined"
      >
        <InputNumber
          v-model:value="form.downstreamDepth"
          data-testid="field-downstream"
          :min="0"
          style="width: 100%"
        />
      </Form.Item>
      <Typography.Paragraph type="secondary">{{ t('settings.lineage.rangeNote') }}</Typography.Paragraph>
      <Form.Item :label="t('settings.lineage.layer')">
        <Select
          v-model:value="form.lineageLayer"
          data-testid="field-lineage-layer"
          :options="[
            { value: 'EntityLineage', label: t('settings.lineage.entityLineage') },
            { value: 'ColumnLevelLineage', label: t('settings.lineage.columnLineage') },
            { value: 'DataObservability', label: t('settings.lineage.dataObservability') },
          ]"
        />
      </Form.Item>
      <Form.Item :label="t('settings.lineage.pipelineMode')">
        <Select
          v-model:value="form.pipelineViewMode"
          data-testid="field-pipeline-view-mode"
          :options="[
            { value: 'Edge', label: t('settings.lineage.edge') },
            { value: 'Node', label: t('settings.lineage.node') },
          ]"
        />
      </Form.Item>
      <Space>
        <Button type="primary" data-testid="platform-lineage-save" :loading="saving" @click="save">
          {{ t('settings.lineage.save') }}
        </Button>
        <Button data-testid="platform-lineage-cancel" @click="cancel">
          {{ t('settings.lineage.cancel') }}
        </Button>
      </Space>
    </Form>
  </Card>
</template>

<style scoped>
.lineage-settings__rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lineage-settings__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
</style>
