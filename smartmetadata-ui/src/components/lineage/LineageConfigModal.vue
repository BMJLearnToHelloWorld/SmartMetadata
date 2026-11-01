<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Form, InputNumber, Select } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import {
  LINEAGE_LAYERS,
  LINEAGE_PIPELINE_MODES,
  type LineageCanvasConfig,
} from '@/lineage/config';

const props = defineProps<{
  open: boolean;
  config: LineageCanvasConfig;
}>();

const emit = defineEmits<{
  ok: [config: LineageCanvasConfig];
  cancel: [];
}>();

const { t } = useI18n();
const form = reactive<LineageCanvasConfig>({ ...props.config });

watch(
  () => props.open,
  (open) => {
    if (open) {
      Object.assign(form, props.config);
    }
  },
);

const layerOptions = LINEAGE_LAYERS.map((item) => ({
  value: item.value,
  label: t(item.labelKey),
  disabled: !item.supported,
}));

const modeOptions = LINEAGE_PIPELINE_MODES.map((item) => ({
  value: item.value,
  label: t(item.labelKey),
}));

function onOk(): void {
  emit('ok', { ...form });
}
</script>

<template>
  <FormModal
    :open="open"
    :title="t('lineage.config')"
    test-id="lineage-config-modal"
    @ok="onOk"
    @cancel="emit('cancel')"
    @update:open="emit('cancel')"
  >
    <Form layout="vertical">
      <Form.Item :label="t('lineage.upstreamDepth')">
        <InputNumber
          v-model:value="form.upstreamDepth"
          data-testid="lineage-config-upstream"
          :min="0"
          :max="3"
        />
      </Form.Item>
      <Form.Item :label="t('lineage.downstreamDepth')">
        <InputNumber
          v-model:value="form.downstreamDepth"
          data-testid="lineage-config-downstream"
          :min="0"
          :max="3"
        />
      </Form.Item>
      <Form.Item :label="t('lineage.nodesPerLayer')">
        <InputNumber
          v-model:value="form.nodesPerLayer"
          data-testid="lineage-config-nodes-per-layer"
          :min="5"
        />
      </Form.Item>
      <Alert
        type="info"
        show-icon
        data-testid="lineage-config-nodes-residual"
        :message="t('lineage.nodesPerLayerResidual')"
      />
      <Form.Item :label="t('lineage.layer')">
        <Select
          v-model:value="form.layer"
          data-testid="lineage-config-layer"
          :options="layerOptions"
        />
      </Form.Item>
      <Alert
        type="info"
        show-icon
        data-testid="lineage-config-layer-residual"
        :message="t('lineage.layerObservabilityResidual')"
      />
      <Form.Item :label="t('lineage.pipelineViewMode')">
        <Select
          v-model:value="form.pipelineViewMode"
          data-testid="lineage-config-pipeline-mode"
          :options="modeOptions"
        />
      </Form.Item>
      <p>{{ t('lineage.configHelp') }}</p>
    </Form>
  </FormModal>
</template>
