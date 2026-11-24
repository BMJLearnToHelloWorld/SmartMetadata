<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Typography } from 'ant-design-vue';
import { EditOutlined } from '@ant-design/icons-vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';

/**
 * Column description cell (pin `TableDescription`, convergence lane):
 * a render-only cell — rich-text preview (`RichTextEditorPreviewerNew`
 * equivalent) plus a hover edit button that reports the click to the
 * parent via `onEdit`. The cell owns NO modal and NO save: pin holds
 * the edited row in the parent (`SchemaTable.editColumn`) and mounts
 * one shared `ModalWithMarkdownEditor` at the table root; the product
 * parent is `AssetDetailPiece` (`editDescriptionRow` +
 * `ColumnDescriptionModal`). The batch-2 cell-owned modal is removed.
 *
 * The preview is the read-only `SmRichTextEditor` (the same fixed
 * preview form as A7 `EntityDescriptionCell`), NOT `SmMarkdown`:
 * the editor stores its content as HTML and `SmMarkdown` escapes
 * raw HTML, so a markdown preview would show the stored tags as
 * literal text.
 *
 * `hasEditAccess` is the caller's already-derived gate
 * (`isAdminUser || canEditDescription`); the cell never reads a
 * permission object. `readOnly` is pin `isReadOnly` (soft-deleted
 * entity): both must allow for the button to show.
 */
const props = withDefaults(
  defineProps<{
    description?: string;
    hasEditAccess: boolean;
    readOnly?: boolean;
    onEdit: () => void;
    testId?: string;
  }>(),
  { description: '', readOnly: false, testId: 'column-description-cell' },
);

const { t } = useI18n();

const isEmpty = computed(() => !props.description?.trim());
const emptyText = computed(() => t('label.no-entity', { entity: t('label.description') }));
const canEdit = computed(() => props.hasEditAccess && !props.readOnly);
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
      @click="onEdit"
    >
      <EditOutlined />
    </Button>
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
