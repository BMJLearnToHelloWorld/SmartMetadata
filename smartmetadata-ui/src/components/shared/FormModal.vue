<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Modal } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { MODAL_SIZES, type ModalSizeKey } from './presentation';

/**
 * Shared form modal wrapper: title, open state, confirm loading and
 * ok-disabled all come from props; the form itself is the caller's
 * slot. Button copy comes from the shared crud keys, never literals.
 *
 * Width comes from the MODAL_SIZES data table (observed official
 * widths, see presentation.ts), never a per-call-site literal.
 * destroyOnClose unmounts the form DOM on close; ok only emits — the
 * caller closes on success and leaves the modal open on failure, the
 * same submit semantics as official FormDrawerUtils.submitAndClose.
 */
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    okText?: string;
    cancelText?: string;
    confirmLoading?: boolean;
    okDisabled?: boolean;
    size?: ModalSizeKey;
    destroyOnClose?: boolean;
    testId?: string;
  }>(),
  {
    okText: undefined,
    cancelText: undefined,
    confirmLoading: false,
    okDisabled: false,
    size: 'form',
    destroyOnClose: true,
    testId: 'form-modal',
  },
);
const emit = defineEmits<{ ok: []; cancel: []; 'update:open': [open: boolean] }>();
const { t } = useI18n();
</script>

<template>
  <Modal
    :data-testid="testId"
    :open="open"
    :title="title"
    :width="MODAL_SIZES[size]"
    :destroy-on-close="destroyOnClose"
    :ok-text="okText ?? t('crud.save')"
    :cancel-text="cancelText ?? t('crud.cancel')"
    :confirm-loading="confirmLoading"
    :ok-button-props="{ disabled: okDisabled }"
    @ok="emit('ok')"
    @cancel="emit('cancel'); emit('update:open', false)"
  >
    <slot />
  </Modal>
</template>
