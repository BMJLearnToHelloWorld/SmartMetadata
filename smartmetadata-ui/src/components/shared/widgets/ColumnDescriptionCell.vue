<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Typography, message } from 'ant-design-vue';
import { EditOutlined } from '@ant-design/icons-vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';

/**
 * Column description cell (D-2 batch 2, column edit mode definition
 * for batch 3 reuse): the product port of pin `TableDescription` —
 * rich-text preview (`RichTextEditorPreviewerNew`), a hover edit
 * button (`WidgetEditButton`) opening `ModalWithMarkdownEditor`, and
 * save through the column's own update (pin `updateTableColumn`, a
 * direct column PATCH, not the entity `onUpdate`). `isReadOnly`
 * hides the button. This batch builds the component + test only; the
 * schema-table wiring is batch 3's TableSchema work.
 *
 * The preview is the read-only `SmRichTextEditor` (the same fixed
 * preview form as A7 `EntityDescriptionCell`), NOT `SmMarkdown`:
 * the editor stores its content as HTML and `SmMarkdown` escapes
 * raw HTML, so a markdown preview would show the stored tags as
 * literal text.
 *
 * Call convention (BENCHMARK §14): Table / DashboardDataModel
 * description saves via single-column PUT (`updateTableColumn` /
 * `updateDataModelColumn`); Topic / Container / SearchIndex via
 * entity PATCH column-path op (same family as `columnTagsPatch`).
 * `hasEditAccess` is the caller's already-derived gate
 * (`isAdminUser || canEditDescription`); the cell never reads a
 * permission object. `onSave` receives the trimmed description;
 * it throws on failure so the cell keeps the editor open. Never an
 * `Input.TextArea` — the editor is always `SmRichTextEditor`.
 */
const props = withDefaults(
  defineProps<{
    description?: string;
    entityName: string;
    hasEditAccess: boolean;
    readOnly?: boolean;
    onSave: (description: string) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { description: '', readOnly: false, testId: 'column-description-cell' },
);

const { t } = useI18n();

const editorRef = ref<InstanceType<typeof SmRichTextEditor> | null>(null);
const editorOpen = ref(false);
const saving = ref(false);

const isEmpty = computed(() => !props.description?.trim());
const emptyText = computed(() => t('label.no-entity', { entity: t('label.description') }));
const canEdit = computed(() => props.hasEditAccess && !props.readOnly);

async function saveDescription(): Promise<void> {
  const content = editorRef.value?.getEditorContent()?.trim() ?? '';
  saving.value = true;
  try {
    await props.onSave(content);
    editorOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div :data-testid="testId" class="column-description-cell">
    <div class="column-description-cell__preview">
      <Typography.Text v-if="isEmpty" type="secondary">{{ emptyText }}</Typography.Text>
      <SmRichTextEditor v-else :readonly="true" :show-menu="false" :initial-value="description" />
    </div>
    <Button
      v-if="canEdit"
      type="text"
      size="small"
      class="column-description-cell__edit"
      data-testid="edit-column-description"
      :title="t('label.edit-entity', { entity: t('label.description') })"
      @click="editorOpen = true"
    >
      <EditOutlined />
    </Button>
    <Modal
      :open="editorOpen"
      :title="t('label.edit-entity', { entity: entityName })"
      :mask-closable="false"
      :keyboard="false"
      :closable="false"
      :confirm-loading="saving"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      @ok="saveDescription"
      @cancel="editorOpen = false"
    >
      <SmRichTextEditor ref="editorRef" :initial-value="description" />
    </Modal>
  </div>
</template>

<style scoped>
.column-description-cell {
  position: relative;
}

.column-description-cell__edit {
  position: absolute;
  top: 0;
  right: 0;
  opacity: 0;
}

.column-description-cell:hover .column-description-cell__edit,
.column-description-cell__edit:focus-visible {
  opacity: 1;
}
</style>
