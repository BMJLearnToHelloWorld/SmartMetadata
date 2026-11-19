<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin ModalWithMarkdownEditor.tsx: non-dismissable modal
  with an autofocused rich-text editor, Cancel (disabled while
  saving) and Save (loading while saving). Save sends the trimmed
  editor content to onSave; a thrown save error toasts and leaves
  the modal open. Closing on success is the caller's job: pin's
  visibility is parent-controlled.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, message } from 'ant-design-vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';

const props = defineProps<{
  open: boolean;
  header: string;
  placeholder: string;
  value?: string;
  onCancel: () => void;
  onSave: (content: string) => Promise<void>;
}>();

const { t } = useI18n();
const isLoading = ref(false);
const content = ref(props.value ?? '');

watch(
  () => props.open,
  (open) => {
    if (open) {
      content.value = props.value ?? '';
      isLoading.value = false;
    }
  },
);

async function handleSaveData(): Promise<void> {
  isLoading.value = true;
  try {
    await props.onSave(content.value.trim());
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :mask-closable="false"
    :closable="false"
    :keyboard="false"
    :footer="null"
    :title="null"
  >
    <div data-testid="markdown-editor">
      <h4 data-testid="header" style="font-weight: 600; margin-bottom: 20px">{{ header }}</h4>
      <SmRichTextEditor
        :key="open ? 'open' : 'closed'"
        :autofocus="true"
        :initial-value="value ?? ''"
        :place-holder="placeholder"
        @text-change="(next) => { content = next; }"
      />
      <div style="display: flex; gap: 12px; margin-top: 20px">
        <Button data-testid="cancel" :disabled="isLoading" @click="onCancel">
          {{ t('label.cancel') }}
        </Button>
        <Button type="primary" data-testid="save" :loading="isLoading" @click="void handleSaveData()">
          {{ t('label.save') }}
        </Button>
      </div>
    </div>
  </Modal>
</template>
