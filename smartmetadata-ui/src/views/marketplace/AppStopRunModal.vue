<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { message } from 'ant-design-vue';
import { Button, Modal } from 'ant-design-vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { stopApp } from '@/api/apps';

const props = defineProps<{
  appName: string;
  isModalOpen: boolean;
  displayName: string;
  runId?: string;
  onClose: () => void;
  onStopWorkflowsUpdate?: () => void;
}>();

const { t } = useI18n();
const isLoading = ref(false);

/**
 * Official StopScheduleRunModal (components/Modals/StopScheduleRun/
 * StopScheduleRunModal.tsx, pin a3012259ca): width 480,
 * non-dismissable, no close button, title `${Stop} ${displayName} ?`
 * (space before the question mark). Confirm stops the app run; the
 * modal closes in `finally` on both success and failure, and the
 * refresh callback runs only on success. Pin checks the axios
 * response status; the product client throws on non-2xx, so reaching
 * the toast means the stop succeeded.
 */
async function handleConfirm(): Promise<void> {
  isLoading.value = true;
  try {
    await stopApp(props.appName, props.runId);
    message.success(t('message.application-stop', { pipelineName: props.displayName }));
    props.onStopWorkflowsUpdate?.();
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    props.onClose();
    isLoading.value = false;
  }
}
</script>

<template>
  <Modal
    :closable="false"
    :footer="null"
    :keyboard="false"
    :mask-closable="false"
    :open="isModalOpen"
    :width="480"
    @cancel="onClose"
  >
    <div data-testid="stop-modal">
      <div style="font-weight: 600; margin-bottom: 8px">
        {{ `${t('label.stop')} ${displayName} ?` }}
      </div>
      <div data-testid="stop-modal-body" style="color: #8c8c8c; font-size: 14px; margin-bottom: 16px">
        {{
          t('message.are-you-sure-action-property', {
            action: t('label.stop'),
            propertyName: displayName,
          })
        }}
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 12px">
        <Button :disabled="isLoading" size="small" @click="onClose">{{ t('label.cancel') }}</Button>
        <Button
          danger
          data-testid="stop-modal-confirm"
          :loading="isLoading"
          size="small"
          type="primary"
          @click="handleConfirm"
        >
          {{ t('label.confirm') }}
        </Button>
      </div>
    </div>
  </Modal>
</template>
