<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, toRef } from 'vue';
import type { PersonaPage } from '@/types/persona';
import CustomizeLeaveModal from './CustomizeLeaveModal.vue';
import CustomizePageHeader from './CustomizePageHeader.vue';
import CustomizeTabWidget from './CustomizeTabWidget.vue';
import EntityPreviewHeader from './EntityPreviewHeader.vue';
import { getDummyDataByPage } from './customizePageData';
import { jsonPatchEmpty } from './customizeTypes';
import { useCustomizePageEditor } from './useCustomizePageEditor';

/**
 * CustomizableDomainPage equivalent (official
 * pages/CustomizableDomainPage/CustomizableDomainPage.tsx): A-face
 * special page, not the generic details editor. Dirty compare is the
 * RAW compare (jsonPatchEmpty), NOT isSameDetailsPageLayout; reset is
 * the no-arg onSaveLayout() delete-page call; preview is
 * getDummyDataByPage + the EntityHeader equivalent with FQN-split
 * breadcrumbs. Unlike the details editor, an empty currentPageType
 * disables save but still renders (official has no null return here).
 */
const props = defineProps<{
  personaName: string;
  currentPage: PersonaPage | null;
  currentPageType: string;
  originalPage: PersonaPage | null;
  onUpdateCurrentPage: (page: PersonaPage) => void;
  onSaveLayout: (newPage?: PersonaPage) => Promise<void>;
}>();

defineEmits<{
  close: [];
}>();

const editor = useCustomizePageEditor({
  currentPageType: props.currentPageType,
  currentPage: toRef(props, 'currentPage'),
  originalPage: toRef(props, 'originalPage'),
  isSamePage: jsonPatchEmpty,
  onSaveLayout: props.onSaveLayout,
});

const dummy = computed(() => getDummyDataByPage(props.currentPageType));
</script>

<template>
  <div data-testid="domain-page-editor">
    <CustomizePageHeader
      :page-label="currentPageType"
      :persona-name="personaName"
      :disable-save="editor.disableSave.value"
      :saving="editor.saving.value"
      @save="editor.saveFromButton()"
      @reset="editor.resetFromButton()"
      @close="$emit('close')"
    />
    <EntityPreviewHeader :dummy="dummy" variant="domain" />
    <CustomizeTabWidget
      :current-page="currentPage"
      :current-page-type="currentPageType"
      :on-update-current-page="onUpdateCurrentPage"
    />
    <CustomizeLeaveModal
      :open="editor.guard.showLeaveModal.value"
      :saving="editor.saving.value"
      @save-and-exit="editor.guard.saveAndLeave()"
      @discard="editor.guard.discardAndLeave()"
      @cancel="editor.guard.cancelLeave()"
    />
  </div>
</template>
