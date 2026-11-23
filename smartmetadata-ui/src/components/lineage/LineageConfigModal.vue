<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Form, InputNumber } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import type { LineageCanvasConfig } from '@/lineage/config';

const props = defineProps<{
  open: boolean;
  config: LineageCanvasConfig;
}>();

const emit = defineEmits<{
  ok: [config: LineageCanvasConfig];
  cancel: [];
}>();

const { t } = useI18n();
// Official LINEAGE_CONFIG_FIELDS (Lineage.constants.ts:219, pin
// a3012259ca): the modal edits depths + nodes per layer only. Layer and
// pipeline view mode live on the admin settings page; the form still
// starts as a copy of the incoming config, so saving here preserves
// them, mirroring the official onSave({ ...config, ...depths }).
const form = reactive<LineageCanvasConfig>({ ...props.config });

watch(
  () => props.open,
  (open) => {
    if (open) {
      Object.assign(form, props.config);
    }
  },
);

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
      <p>{{ t('lineage.configHelp') }}</p>
    </Form>
  </FormModal>
</template>
