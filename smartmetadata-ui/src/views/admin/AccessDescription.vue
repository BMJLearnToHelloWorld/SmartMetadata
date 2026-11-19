<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  PAT-DESCRIPTION port of components/common/EntityDescription/Description.tsx
  as consumed by RolesDetailPage/PoliciesDetailPage (03 §2.4): label header,
  preview, edit button gated only by hasEditAccess (callers pass the literal
  true, mirroring the pin), and a modal rich-text editor. No comments icon:
  both pin detail pages pass showCommentsIcon={false}.
  Save semantics mirror ModalWithMarkdownEditor + handleDescriptionChange:
  content is getEditorContent().trim(); a handler that swallows its own
  failure (the pin detail handlers) still closes the modal, while a throwing
  handler toasts and leaves the modal open.
-->
<script setup lang="ts">
import { EditOutlined } from '@ant-design/icons-vue';
import { Button, Modal, Space, Typography, message } from 'ant-design-vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';

const props = defineProps<{
  description?: string;
  entityName: string;
  hasEditAccess: boolean;
  onDescriptionUpdate: (description: string) => Promise<unknown> | unknown;
}>();

const { t } = useI18n();

const editorOpen = ref(false);
const editorKey = ref(0);
const saving = ref(false);
const editorRef = ref<{ getEditorContent: () => string } | null>(null);

function openEditor(): void {
  editorKey.value += 1;
  editorOpen.value = true;
}

async function saveDescription(): Promise<void> {
  const content = editorRef.value?.getEditorContent()?.trim() ?? '';
  saving.value = true;
  try {
    await props.onDescriptionUpdate(content);
    editorOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div data-testid="asset-description-container">
    <Space align="center" :size="8" wrap>
      <Typography.Text strong>{{ t('label.description') }}</Typography.Text>
      <Button
        v-if="hasEditAccess"
        type="text"
        size="small"
        data-testid="edit-description"
        :title="t('label.edit-entity', { entity: t('label.description') })"
        @click="openEditor"
      >
        <template #icon><EditOutlined /></template>
      </Button>
    </Space>
    <div>
      <SmMarkdown :markdown="description ?? ''" />
    </div>
    <Modal
      :open="editorOpen"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :title="t('label.edit-description-for', { entityName })"
      @cancel="editorOpen = false"
    >
      <SmRichTextEditor
        :key="editorKey"
        ref="editorRef"
        :autofocus="true"
        :initial-value="description ?? ''"
        :place-holder="t('label.enter-entity', { entity: t('label.description') })"
      />
      <template #footer>
        <Button data-testid="cancel" @click="editorOpen = false">{{ t('label.cancel') }}</Button>
        <Button type="primary" data-testid="save" :loading="saving" @click="saveDescription">
          {{ t('label.save') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>
