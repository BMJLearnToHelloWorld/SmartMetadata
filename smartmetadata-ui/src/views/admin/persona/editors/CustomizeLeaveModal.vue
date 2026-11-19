<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button, Modal } from 'ant-design-vue';

defineProps<{
  open: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  saveAndExit: [];
  discard: [];
  cancel: [];
}>();

const { t } = useI18n();
</script>

<template>
  <Modal
    :open="open"
    :title="t('home.unsavedChanges')"
    :closable="false"
    :mask-closable="false"
    @cancel="emit('cancel')"
  >
    <p>{{ t('home.unsavedChangesMessage') }}</p>
    <template #footer>
      <Button data-testid="customize-leave-cancel" @click="emit('cancel')">
        {{ t('crud.cancel') }}
      </Button>
      <Button data-testid="customize-leave-discard" @click="emit('discard')">
        {{ t('home.discardChanges') }}
      </Button>
      <Button
        type="primary"
        data-testid="customize-leave-save-exit"
        :loading="saving"
        @click="emit('saveAndExit')"
      >
        {{ t('home.saveAndExit') }}
      </Button>
    </template>
  </Modal>
</template>
