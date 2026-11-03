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

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  ok: [value: { question: string; answer?: string; description?: string }];
  cancel: [];
  'update:open': [open: boolean];
}>();

const form = reactive({ question: '', answer: '', description: '' });

watch(
  () => props.open,
  (open) => {
    if (open) {
      form.question = '';
      form.answer = '';
      form.description = '';
    }
  },
);

function onOk(): void {
  emit('ok', {
    question: form.question.trim(),
    answer: form.answer.trim() || undefined,
    description: form.description.trim() || undefined,
  });
}
</script>

<template>
  <FormModal
    :open="open"
    :title="t('contextCenter.createMemory')"
    :ok-disabled="!form.question.trim()"
    test-id="memory-form-modal"
    @ok="onOk"
    @cancel="emit('cancel')"
    @update:open="emit('update:open', $event)"
  >
    <Form layout="vertical">
      <Form.Item :label="t('contextCenter.question')" required>
        <Input.TextArea
          v-model:value="form.question"
          data-testid="memory-form-question"
          :rows="3"
        />
      </Form.Item>
      <Form.Item :label="t('contextCenter.answer')">
        <Input.TextArea v-model:value="form.answer" data-testid="memory-form-answer" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('contextCenter.description')">
        <Input.TextArea
          v-model:value="form.description"
          data-testid="memory-form-description"
          :rows="2"
        />
      </Form.Item>
    </Form>
  </FormModal>
</template>
