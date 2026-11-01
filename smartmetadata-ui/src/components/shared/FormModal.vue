<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Modal } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * Shared form modal wrapper: title, open state, confirm loading and
 * ok-disabled all come from props; the form itself is the caller's
 * slot. Button copy comes from the shared crud keys, never literals.
 */
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    okText?: string;
    cancelText?: string;
    confirmLoading?: boolean;
    okDisabled?: boolean;
    testId?: string;
  }>(),
  { okText: undefined, cancelText: undefined, confirmLoading: false, okDisabled: false, testId: 'form-modal' },
);
const emit = defineEmits<{ ok: []; cancel: []; 'update:open': [open: boolean] }>();
const { t } = useI18n();
</script>

<template>
  <Modal
    :data-testid="testId"
    :open="open"
    :title="title"
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
