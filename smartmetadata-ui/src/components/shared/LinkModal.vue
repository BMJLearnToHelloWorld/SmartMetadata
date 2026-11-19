<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Link dialog (ported from official LinkModal.tsx at pin a3012259ca).
  Titles mirror official's hardcoded English strings through i18n keys
  (multilingual allowance): `label.add-link` / `label.edit-link`.
  Non-dismissable overlay (mask click and Escape do not close it); the
  close button and Cancel both call onCancel.
-->
<script setup lang="ts">
import { Button, Form, Input, Modal } from 'ant-design-vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

export interface LinkData {
  href: string;
}

const props = defineProps<{
  isOpen: boolean;
  data: LinkData;
  getContainer?: () => HTMLElement;
}>();

const emit = defineEmits<{
  (e: 'save', data: LinkData): void;
  (e: 'cancel'): void;
}>();

const { t } = useI18n();
const href = ref(props.data.href);

function handleSubmit() {
  emit('save', { href: href.value });
}
</script>

<template>
  <Modal
    :open="isOpen"
    :width="520"
    :title="data.href ? t('label.edit-link') : t('label.add-link')"
    :mask-closable="false"
    :keyboard="false"
    :get-container="getContainer"
    class="block-editor-link-modal"
    @cancel="emit('cancel')"
  >
    <form id="link-form" data-testid="link-form" @submit.prevent="handleSubmit">
      <Form.Item :label="t('label.link')">
        <Input
          id="href"
          v-model:value="href"
          name="href"
          :autofocus="true"
        />
      </Form.Item>
    </form>
    <template #footer>
      <Button @click="emit('cancel')">{{ t('crud.cancel') }}</Button>
      <Button type="primary" html-type="submit" form="link-form">
        {{ t('crud.save') }}
      </Button>
    </template>
  </Modal>
</template>
