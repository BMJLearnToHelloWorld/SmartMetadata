<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Column description edit modal (D-2 batch 3): the product form of
  official `ModalWithMarkdownEditor` as used by every pin schema face
  (SchemaTable / TopicSchema / ContainerDataModel / SearchIndexFieldsTable
  / ModelTab / APIEndpointSchema / MlModelFeaturesList) — the parent holds
  the edited row, this modal only edits the text. Shape follows A7
  `EntityDescriptionCell` §4.3 (the定型 modal form): mask-closable false,
  keyboard false, closable false; SmRichTextEditor rebuilt per open;
  Save takes `getEditorContent().trim()` and calls `onSave`; a failed
  save shows `message.error` and keeps the modal open.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, message } from 'ant-design-vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';

export type ColumnDescriptionEntityLabel = 'column' | 'field' | 'feature';

const props = defineProps<{
  open: boolean;
  columnName: string;
  entityLabel: ColumnDescriptionEntityLabel;
  initialValue?: string;
  onSave: (description: string) => Promise<unknown> | unknown;
  onCancel: () => void;
}>();

const { t } = useI18n();

const editorKey = ref(0);
const saving = ref(false);
const editorRef = ref<{ getEditorContent: () => string } | null>(null);

// Rebuild the editor on every open so it starts from the current row's
// description (same rule as EntityDescriptionCell's editorKey).
watch(
  () => props.open,
  (open) => {
    if (open) {
      editorKey.value += 1;
    }
  },
);

const title = computed(
  () => `${t('label.edit-entity', { entity: t(`label.${props.entityLabel}`) })}: "${props.columnName}"`,
);

function placeholder(): string {
  // Pin placeholders: Table uses `message.enter-column-description`,
  // every other face uses `label.enter-field-description(field)`.
  if (props.entityLabel === 'column') {
    return t('label.enter-column-description');
  }
  return t('label.enter-field-description', { field: t(`label.${props.entityLabel}`) });
}

async function saveDescription(): Promise<void> {
  const content = editorRef.value?.getEditorContent()?.trim() ?? '';
  saving.value = true;
  try {
    await props.onSave(content);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :closable="false"
    :mask-closable="false"
    :keyboard="false"
    :title="title"
    @cancel="onCancel"
  >
    <SmRichTextEditor
      :key="editorKey"
      ref="editorRef"
      :autofocus="true"
      :initial-value="initialValue ?? ''"
      :place-holder="placeholder()"
    />
    <template #footer>
      <Button data-testid="cancel" @click="onCancel">{{ t('label.cancel') }}</Button>
      <Button type="primary" data-testid="save" :loading="saving" @click="saveDescription">
        {{ t('label.save') }}
      </Button>
    </template>
  </Modal>
</template>
