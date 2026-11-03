<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{ open: boolean }>(),
  {},
);

const emit = defineEmits<{
  ok: [value: { name: string; displayName?: string; description?: string }];
  cancel: [];
  'update:open': [open: boolean];
}>();

const form = reactive({ name: '', displayName: '', description: '' });

watch(
  () => props.open,
  (open) => {
    if (open) {
      form.name = '';
      form.displayName = '';
      form.description = '';
    }
  },
);

function onOk(): void {
  emit('ok', {
    name: form.name.trim(),
    displayName: form.displayName.trim() || undefined,
    description: form.description.trim() || undefined,
  });
}
</script>

<template>
  <FormModal
    :open="open"
    :title="t('contextCenter.createFolder')"
    :ok-disabled="!form.name.trim()"
    test-id="folder-form-modal"
    @ok="onOk"
    @cancel="emit('cancel')"
    @update:open="emit('update:open', $event)"
  >
    <Form layout="vertical">
      <Form.Item :label="t('contextCenter.name')" required>
        <Input v-model:value="form.name" data-testid="folder-form-name" />
      </Form.Item>
      <Form.Item :label="t('contextCenter.displayName')">
        <Input v-model:value="form.displayName" data-testid="folder-form-display-name" />
      </Form.Item>
      <Form.Item :label="t('contextCenter.description')">
        <Input.TextArea
          v-model:value="form.description"
          data-testid="folder-form-description"
          :rows="3"
        />
      </Form.Item>
    </Form>
  </FormModal>
</template>
