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
import { isSameDetailsPageLayout } from './gridLayoutUtils';
import { useCustomizePageEditor } from './useCustomizePageEditor';

/**
 * CustomiseGlossaryTermDetailPage equivalent (official
 * components/MyData/CustomizableComponents/CustomiseGlossaryTermDetailPage):
 * ONE component for Glossary and GlossaryTerm, distinguished by
 * `isGlossary` (passed to the GlossaryHeaderWidget equivalent).
 * Dirty compare is isSameDetailsPageLayout; reset is the no-arg
 * onSaveLayout() delete-page call; empty currentPageType disables
 * save and renders nothing.
 */
const props = defineProps<{
  personaName: string;
  currentPage: PersonaPage | null;
  currentPageType: string;
  originalPage: PersonaPage | null;
  isGlossary: boolean;
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
  isSamePage: isSameDetailsPageLayout,
  onSaveLayout: props.onSaveLayout,
});

const dummy = computed(() => getDummyDataByPage(props.currentPageType));
</script>

<template>
  <div v-if="currentPageType" data-testid="glossary-page-editor">
    <CustomizePageHeader
      :page-label="currentPageType"
      :persona-name="personaName"
      :disable-save="editor.disableSave.value"
      :saving="editor.saving.value"
      @save="editor.saveFromButton()"
      @reset="editor.resetFromButton()"
      @close="$emit('close')"
    />
    <EntityPreviewHeader :dummy="dummy" variant="glossary" :is-glossary="isGlossary" />
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
