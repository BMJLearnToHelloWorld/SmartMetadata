<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { SaveOutlined } from '@ant-design/icons-vue';
import { Button, Modal } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    open: boolean;
    loading?: boolean;
    title?: string;
    description?: string;
    discardText?: string;
    saveText?: string;
  }>(),
  {
    loading: false,
    title: undefined,
    description: undefined,
    discardText: undefined,
    saveText: undefined,
  },
);

const emit = defineEmits<{
  cancel: [];
  discard: [];
  save: [];
}>();

const { t } = useI18n();
</script>

<template>
  <!-- Pin sets aria-label on the Dialog; antd-vue Modal has no equivalent
       prop and swallows a fallthrough aria-label (verified: it reaches no
       element), so none is declared here. See report residual R-ARIA. -->
  <Modal
    :closable="true"
    destroy-on-close
    :mask-closable="true"
    :open="open"
    :title="null"
    :width="400"
    @cancel="emit('cancel')"
  >
    <div data-testid="unsaved-changes-modal">
      <span><SaveOutlined /></span>
      <h5 data-testid="unsaved-changes-modal-title">
        {{ props.title ?? t('sso.unsavedChanges') }}
      </h5>
      <div data-testid="unsaved-changes-modal-description">
        {{ props.description ?? t('sso.unsavedChangesDescription') }}
      </div>
    </div>
    <template #footer>
      <div style="display: flex">
        <Button
          data-testid="unsaved-changes-modal-discard"
          style="flex: 1"
          @click="emit('discard')"
        >
          {{ props.discardText ?? t('sso.unsavedChangesDiscard') }}
        </Button>
        <Button
          data-testid="unsaved-changes-modal-save"
          :loading="loading"
          style="flex: 1"
          type="primary"
          @click="emit('save')"
        >
          {{ props.saveText ?? t('sso.unsavedChangesSave') }}
        </Button>
      </div>
    </template>
  </Modal>
</template>
