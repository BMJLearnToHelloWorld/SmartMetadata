<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, Modal } from 'ant-design-vue';
import { MODAL_SIZES } from '@/components/shared/presentation';

/**
 * Pin EntityExportModal for dashboard PDF (DataQualityPage handleExportDashboard
 * → showModal with exportTypes: [PDF]). Official ExportUtilClassBase has no
 * PDF capture branch yet; this modal matches the export chrome and filename.
 */
const props = defineProps<{
  open: boolean;
  defaultFileName: string;
}>();

const emit = defineEmits<{
  cancel: [];
  export: [fileName: string];
}>();

const { t } = useI18n();
const fileName = ref(props.defaultFileName);

watch(
  () => props.defaultFileName,
  (value) => {
    fileName.value = value;
  },
);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      fileName.value = props.defaultFileName;
    }
  },
);

function onCancel(): void {
  emit('cancel');
}

function onOk(): void {
  emit('export', fileName.value.trim() || props.defaultFileName);
}
</script>

<template>
  <Modal
    :open="open"
    data-testid="dq-dashboard-export-modal"
    :title="t('label.export-entity', { entity: t('label.data-quality-dashboard') })"
    :width="MODAL_SIZES.export"
    :ok-text="t('label.export')"
    :cancel-text="t('label.cancel')"
    @cancel="onCancel"
    @ok="onOk"
  >
    <Form layout="vertical">
      <Form.Item :label="t('label.file')">
        <Input v-model:value="fileName" data-testid="dq-dashboard-export-filename" />
      </Form.Item>
    </Form>
  </Modal>
</template>