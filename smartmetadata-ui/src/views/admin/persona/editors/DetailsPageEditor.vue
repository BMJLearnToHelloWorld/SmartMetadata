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
 * CustomizeDetailsPage equivalent (official
 * pages/CustomizeDetailsPage/CustomizeDetailsPage.tsx).
 *
 * - `initialPageData` is accepted and IGNORED (official signature
 *   parity); the editor reads currentPage/currentPageType/originalPage
 *   (the store's getPage result) via props.
 * - Empty currentPageType disables save and renders nothing.
 * - Dirty compare is isSameDetailsPageLayout; reset is the no-arg
 *   onSaveLayout() delete-page call; leave interception runs the
 *   throwing save on Save-and-leave.
 * - Preview is getDummyDataByPage + the DataAssetsHeader equivalent
 *   (display-only; update callbacks are no-op by construction).
 */
const props = defineProps<{
  personaName: string;
  currentPage: PersonaPage | null;
  currentPageType: string;
  originalPage: PersonaPage | null;
  /** Accepted for signature parity; ignored, exactly as in official. */
  initialPageData?: PersonaPage | null;
  onUpdateCurrentPage: (page: PersonaPage) => void;
  onSaveLayout: (newPage?: PersonaPage) => Promise<void>;
}>();

defineEmits<{
  close: [];
}>();

void props.initialPageData;

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
  <div v-if="currentPageType" data-testid="details-page-editor">
    <CustomizePageHeader
      :page-label="currentPageType"
      :persona-name="personaName"
      :disable-save="editor.disableSave.value"
      :saving="editor.saving.value"
      @save="editor.saveFromButton()"
      @reset="editor.resetFromButton()"
      @close="$emit('close')"
    />
    <EntityPreviewHeader :dummy="dummy" variant="dataAssets" />
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
