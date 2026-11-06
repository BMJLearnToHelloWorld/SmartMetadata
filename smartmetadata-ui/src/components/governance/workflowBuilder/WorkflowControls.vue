<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { Button, Modal, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official WorkflowControls (pin a3012259ca): Run (only when the mode
 * says so and a run handler is passed), Cancel, Validate and Save. Each
 * button renders only when its handler is passed; Cancel opens the
 * discard modal — Save there saves the workflow, Close without saving
 * reverts to the pre-edit snapshot.
 */
const props = withDefaults(
  defineProps<{
    onTestWorkflow?: () => void;
    onSaveWorkflow?: () => void | Promise<void>;
    onCancelWorkflow?: () => void;
    onRevertAndCancel?: () => void;
    onRunWorkflow?: () => void | Promise<void>;
    isRunLoading?: boolean;
  }>(),
  { isRunLoading: false },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const showRunButton = builder.mode.showRunButton;
const showCancelModal = ref(false);

function handleCancelClick(): void {
  showCancelModal.value = true;
}

function handleProceedToCancel(): void {
  showCancelModal.value = false;
  props.onRevertAndCancel?.();
}

function handleSaveChanges(): void {
  showCancelModal.value = false;
  void props.onSaveWorkflow?.();
}
</script>

<template>
  <div style="display: flex; gap: 12px">
    <Button
      v-if="showRunButton && onRunWorkflow"
      data-testid="run-workflow-button"
      :loading="isRunLoading"
      @click="onRunWorkflow"
    >
      {{ isRunLoading ? t('workflows.builder.running') : t('workflows.builder.runNow') }}
    </Button>
    <Button
      v-if="onCancelWorkflow"
      data-testid="cancel-workflow-button"
      @click="handleCancelClick"
    >
      {{ t('crud.cancel') }}
    </Button>
    <Button
      v-if="onTestWorkflow"
      data-testid="test-workflow-button"
      @click="onTestWorkflow"
    >
      {{ t('workflows.builder.validateWorkflow') }}
    </Button>
    <Button
      v-if="onSaveWorkflow"
      type="primary"
      data-testid="save-workflow-button"
      @click="onSaveWorkflow"
    >
      {{ t('workflows.builder.saveWorkflow') }}
    </Button>

    <Modal
      :open="showCancelModal"
      :title="t('workflows.builder.discardYourChanges')"
      :width="480"
      @cancel="showCancelModal = false"
    >
      <Typography.Paragraph style="margin: 0; color: var(--sm-text-secondary)">
        {{ t('workflows.builder.unsavedChangesWarning') }}
      </Typography.Paragraph>
      <template #footer>
        <Button
          data-testid="save-workflow-cancel-modal-button"
          @click="handleSaveChanges"
        >
          {{ t('workflows.builder.saveWorkflow') }}
        </Button>
        <Button
          type="primary"
          data-testid="close-without-saving-button"
          @click="handleProceedToCancel"
        >
          {{ t('workflows.builder.closeWithoutSaving') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>
