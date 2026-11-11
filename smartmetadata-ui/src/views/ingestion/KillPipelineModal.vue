<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal, message } from 'ant-design-vue';
import { killIngestionPipeline, isPipelineClientDisabled } from '@/api/ingestionPipelines';

const props = defineProps<{
  open: boolean;
  pipelineId: string;
  pipelineName: string;
}>();
const emit = defineEmits<{ close: []; killed: [] }>();

const { t } = useI18n();
const isLoading = ref(false);

/**
 * Official KillIngestionPipelineModal (openmetadata-ui, pin a3012259ca):
 * title "Kill <name> ?", kill warning copy, confirm button loading and
 * the modal not dismissable while confirming. Success toasts and
 * refreshes the caller; failure toasts (a 404 with no runnable run
 * counts as a failure, as does a 200 with reason "Pipeline Client
 * Disabled" — C-01 — and any non-200 code in the body). The modal
 * closes once the attempt completes, success or failure.
 */
async function handleConfirm(): Promise<void> {
  isLoading.value = true;
  try {
    const result = await killIngestionPipeline(props.pipelineId);
    if (isPipelineClientDisabled(result)) {
      message.error(result.reason ?? t('ingestion.pipelines.actionFailed'));
      return;
    }
    if (result.code !== undefined && result.code !== 200) {
      message.error(result.reason ?? t('ingestion.pipelines.actionFailed'));
      return;
    }
    message.success(
      t('ingestion.pipelines.killedSuccessfully', { pipelineName: props.pipelineName }),
    );
    emit('killed');
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
  } finally {
    isLoading.value = false;
    emit('close');
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('ingestion.pipelines.killTitle', { name: pipelineName })"
    :ok-text="t('ingestion.pipelines.confirm')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="isLoading"
    :mask-closable="!isLoading"
    :closable="!isLoading"
    :keyboard="!isLoading"
    data-testid="kill-modal"
    @ok="handleConfirm"
    @cancel="emit('close')"
  >
    <p data-testid="kill-modal-body">{{ t('ingestion.pipelines.killWarning') }}</p>
  </Modal>
</template>
