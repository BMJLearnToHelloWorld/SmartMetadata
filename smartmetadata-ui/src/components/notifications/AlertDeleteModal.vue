<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { DeleteOutlined } from '@ant-design/icons-vue';
import { Button, Modal } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * Alert delete confirmation, ported from pin
 * components/common/DeleteModal/DeleteModal.tsx. The header carries the
 * featured trash icon, the `Delete {entityTitle}` title and the
 * caller-composed message; the footer holds two full-width buttons.
 * Nothing dismisses it while the delete is running.
 */
const props = defineProps<{
  open: boolean;
  entityTitle: string;
  message: string;
  deleting?: boolean;
}>();
const emit = defineEmits<{ cancel: []; confirm: [] }>();
const { t } = useI18n();
</script>

<template>
  <Modal
    :open="props.open"
    :width="400"
    :closable="!props.deleting"
    :mask-closable="!props.deleting"
    :keyboard="!props.deleting"
    :footer="null"
    @cancel="emit('cancel')"
  >
    <!-- The testid rides this wrapper: antd Modal does not forward
    unknown attributes onto a rendered node. -->
    <div data-testid="delete-modal">
      <div class="alert-delete-modal__header" data-testid="modal-header">
        <span class="alert-delete-modal__icon">
          <DeleteOutlined />
        </span>
        <div class="alert-delete-modal__title">
          {{ t('label.delete') }} {{ props.entityTitle }}
        </div>
        <p class="alert-delete-modal__message">{{ props.message }}</p>
      </div>
      <div class="alert-delete-modal__footer" data-testid="modal-footer">
        <Button
          block
          data-testid="cancel-button"
          :disabled="props.deleting"
          @click="emit('cancel')"
        >
          {{ t('label.cancel') }}
        </Button>
        <Button
          block
          danger
          type="primary"
          data-testid="confirm-button"
          :disabled="props.deleting"
          :loading="props.deleting"
          @click="emit('confirm')"
        >
          {{ t('label.delete') }}
        </Button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.alert-delete-modal__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  width: 100%;
}

.alert-delete-modal__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: var(--sm-color-error);
  background: var(--sm-color-error-bg);
  font-size: 20px;
  margin-bottom: 12px;
}

.alert-delete-modal__title {
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-delete-modal__message {
  color: var(--sm-text-secondary);
  overflow-wrap: break-word;
  margin: 0;
}

.alert-delete-modal__footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding-top: 24px;
}
</style>
