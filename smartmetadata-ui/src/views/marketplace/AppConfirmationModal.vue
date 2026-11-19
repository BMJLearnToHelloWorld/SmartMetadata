<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Modal } from 'ant-design-vue';

withDefaults(
  defineProps<{
    visible: boolean;
    header: string;
    bodyText: string;
    cancelText: string;
    confirmText: string;
    isLoading?: boolean;
    isDestructive?: boolean;
  }>(),
  { isLoading: false, isDestructive: false },
);

defineEmits<{
  cancel: [];
  confirm: [];
}>();

/**
 * Official ConfirmationModal (components/Modals/ConfirmationModal/
 * ConfirmationModal.tsx, pin a3012259ca): width 520, non-dismissable —
 * a stray backdrop click must not answer a confirmation — with the
 * `confirmation-modal` / `modal-header` / `body-text` / `cancel` /
 * `save-button` testids. The confirm button carries `loading-button`
 * while loading and renders destructive when the prompt is
 * destructive or the confirm text is the Delete label. The Delete
 * comparison needs the translated label, so the caller passes
 * `isDestructive` when the confirm text is the delete label.
 */
</script>

<template>
  <Modal
    :closable="false"
    :footer="null"
    :keyboard="false"
    :mask-closable="false"
    :open="visible"
    :width="520"
    @cancel="$emit('cancel')"
  >
    <div data-testid="confirmation-modal">
      <div v-if="header" data-testid="modal-header" style="font-weight: 600; margin-bottom: 8px">
        {{ header }}
      </div>
      <div data-testid="body-text" style="min-height: 80px">{{ bodyText }}</div>
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <Button data-testid="cancel" @click="$emit('cancel')">{{ cancelText }}</Button>
        <Button
          :danger="isDestructive"
          :data-testid="isLoading ? 'loading-button' : 'save-button'"
          :loading="isLoading"
          type="primary"
          @click="$emit('confirm')"
        >
          {{ confirmText }}
        </Button>
      </div>
    </div>
  </Modal>
</template>
