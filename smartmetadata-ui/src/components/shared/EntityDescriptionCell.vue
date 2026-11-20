<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Shared description cell for the eight detail views (D-3): the product
  port of official `Description` (components/common/EntityDescription/
  Description.tsx) as driven by `DescriptionWidget`
  (components/DataAssets/CommonWidgets/widgets/DescriptionWidget.tsx).

  Preview mirrors official `RichTextEditorPreviewerV1`: the description
  is normalized with `formatClientContent` (Markdown or editor HTML in,
  sanitized HTML out) and rendered by a read-only SmRichTextEditor, with
  the official read-more fold past 350 characters
  (DESCRIPTION_PREVIEW_MAX_LENGTH). The edit button follows the
  official gate `!isVersionView && !isReadOnly && hasEditAccess`
  (Description.tsx:184) and opens the rich-text modal (the
  ModalWithMarkdownEditor shape, as already landed in
  views/admin/AccessDescription.vue).

  Deliberately NOT included (official pieces outside D-3): the
  request-description task button, the comment button, and the AI
  suggestion alert. `onDescriptionUpdate` is optional: without it the
  cell is preview-only and renders no edit button.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditOutlined } from '@ant-design/icons-vue';
import { Button, Modal, Typography, message } from 'ant-design-vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import {
  DESCRIPTION_PREVIEW_MAX_LENGTH,
  formatClientContent,
  getTrimmedContent,
  isDescriptionContentEmpty,
} from '@/utils/richTextUtils';

const props = withDefaults(
  defineProps<{
    description?: string;
    entityName: string;
    hasEditAccess: boolean;
    isVersionView?: boolean;
    isReadOnly?: boolean;
    showActions?: boolean;
    /** Official isDescriptionExpanded: the preview starts unfolded. */
    expanded?: boolean;
    /** Official removeBlur: no read-more fold at all (large widget / Domain). */
    removeBlur?: boolean;
    emptyText?: string;
    onDescriptionUpdate?: (description: string) => Promise<unknown> | unknown;
  }>(),
  {
    isVersionView: false,
    isReadOnly: false,
    showActions: true,
    expanded: false,
    removeBlur: false,
    emptyText: '—',
  },
);

const { t } = useI18n();

const editorOpen = ref(false);
const editorKey = ref(0);
const saving = ref(false);
const editorRef = ref<{ getEditorContent: () => string } | null>(null);

// Official PreviewerV1: readMore starts at isDescriptionExpanded.
const readMore = ref(props.expanded);
watch(
  () => props.expanded,
  (value) => {
    readMore.value = value;
  },
);

const isEmpty = computed(() => isDescriptionContentEmpty(props.description));
const hasReadMore = computed(
  () =>
    !props.removeBlur &&
    (props.description?.length ?? 0) > DESCRIPTION_PREVIEW_MAX_LENGTH,
);
// Official viewerValue: the fold truncates the formatted content, never
// the raw markdown. Unfolded, the raw description goes to the editor,
// which normalizes it itself (formatClientContent in its content
// effect), so no double formatting happens on the common path.
const previewContent = computed(() => {
  if (!hasReadMore.value || readMore.value) {
    return props.description ?? '';
  }
  const formatted = formatClientContent(props.description ?? '');
  return `${getTrimmedContent(formatted, DESCRIPTION_PREVIEW_MAX_LENGTH)}...`;
});

const canEdit = computed(
  () =>
    props.showActions &&
    !props.isVersionView &&
    !props.isReadOnly &&
    props.hasEditAccess &&
    props.onDescriptionUpdate !== undefined,
);

function openEditor(): void {
  editorKey.value += 1;
  editorOpen.value = true;
}

async function saveDescription(): Promise<void> {
  const content = editorRef.value?.getEditorContent()?.trim() ?? '';
  saving.value = true;
  try {
    await props.onDescriptionUpdate?.(content);
    editorOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div data-testid="entity-description-cell">
    <div class="entity-description__body">
      <div class="entity-description__preview">
        <Typography.Text v-if="isEmpty" type="secondary">{{ emptyText }}</Typography.Text>
        <SmRichTextEditor
          v-else
          :readonly="true"
          :show-menu="false"
          :initial-value="previewContent"
        />
        <Button
          v-if="hasReadMore"
          type="link"
          size="small"
          :data-testid="readMore ? 'read-less-button' : 'read-more-button'"
          @click="readMore = !readMore"
        >
          {{ readMore ? t('label.collapse') : t('label.expand') }}
        </Button>
      </div>
      <Button
        v-if="canEdit"
        type="text"
        size="small"
        data-testid="edit-description"
        :title="t('label.edit-entity', { entity: t('label.description') })"
        @click="openEditor"
      >
        <template #icon><EditOutlined /></template>
      </Button>
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

<style scoped>
.entity-description__body {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.entity-description__preview {
  flex: 1;
  min-width: 0;
}
</style>
