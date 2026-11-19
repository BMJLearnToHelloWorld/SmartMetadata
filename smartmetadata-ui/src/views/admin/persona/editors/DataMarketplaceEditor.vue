<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from 'ant-design-vue';
import { useAuthStore } from '@/stores/auth';
import type { PersonaPage } from '@/types/persona';
import CustomizeLeaveModal from './CustomizeLeaveModal.vue';
import CustomizePageHeader from './CustomizePageHeader.vue';
import DetailGridEditor from './DetailGridEditor.vue';
import ObjectLayoutNotice from './ObjectLayoutNotice.vue';
import {
  MARKETPLACE_ROW_HEIGHT,
  TAB_GRID_MAX_COLUMNS,
  getDefaultTabs,
  getDefaultWidgetForTab,
} from './customizePageData';
import { jsonPatchEmpty } from './customizeTypes';
import type { WidgetConfig } from './customizeTypes';
import { asCustomizeTab, tabLayout } from './customizeTypes';
import { defaultTabLabelResolver } from './tabLabels';
import { widgetTitle } from './tabLabels';
import { useCustomizePageEditor } from './useCustomizePageEditor';

/**
 * CustomizableDataMarketplacePage equivalent (official
 * pages/CustomizableDataMarketplacePage/CustomizableDataMarketplacePage.tsx).
 *
 * - Edits currentPage.tabs[0].layout; empty/missing layout shows the
 *   default layout; non-empty layouts force w=8, x=0 per widget.
 * - Default layout is dataMarketplaceClassBase.getDefaultLayout(OVERVIEW).
 * - Renders the greeting banner + search bar (isEditView: the search
 *   input is non-interactive in edit view).
 * - Grid: 8 columns, row height 170, margin 16/24, no resize, reorder
 *   only (no add/remove affordances — official has none here).
 * - Dirty compare is the raw compare; reset is local reset +
 *   updateCurrentPage + no-arg onSaveLayout().
 * - D2: a present-but-non-array tabs[0] layout renders the explicit
 *   abnormal state instead of the default grid (conscious deviation
 *   from official's isEmpty fallback for {}, per S-C4STORE §3.2).
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

const { t } = useI18n();
const authStore = useAuthStore();

const editor = useCustomizePageEditor({
  currentPageType: props.currentPageType,
  currentPage: toRef(props, 'currentPage'),
  originalPage: toRef(props, 'originalPage'),
  isSamePage: jsonPatchEmpty,
  onSaveLayout: props.onSaveLayout,
});

const defaultLayout = computed(() =>
  getDefaultWidgetForTab('DataMarketplace', 'overview'),
);

const firstTab = computed(() => {
  const tabs = props.currentPage?.tabs;
  return Array.isArray(tabs) && tabs.length > 0 ? asCustomizeTab(tabs[0]) : null;
});

/** D2: present-but-non-array layout is an abnormal state, not a grid. */
const objectLayout = computed(() => {
  const layout = firstTab.value?.layout;
  return layout !== undefined && !Array.isArray(layout) ? layout : null;
});

function forceFullWidth(layout: WidgetConfig[]): WidgetConfig[] {
  return layout.map((widget) => ({ ...widget, w: TAB_GRID_MAX_COLUMNS, x: 0 }));
}

const displayLayout = computed<WidgetConfig[]>(() => {
  if (objectLayout.value !== null) {
    return [];
  }
  const saved = firstTab.value ? tabLayout(firstTab.value) : [];
  if (saved.length === 0) {
    return defaultLayout.value;
  }
  return forceFullWidth(saved);
});

function defaultTabTemplate() {
  return getDefaultTabs('DataMarketplace', defaultTabLabelResolver(t))[0];
}

function writeLayout(next: WidgetConfig[]): void {
  const forced = forceFullWidth(next);
  const tabs = props.currentPage?.tabs;
  if (Array.isArray(tabs) && tabs.length > 0) {
    props.onUpdateCurrentPage({
      ...(props.currentPage as PersonaPage),
      tabs: tabs.map((rawTab, index) =>
        index === 0
          ? { ...asCustomizeTab(rawTab), layout: forced }
          : rawTab,
      ),
    } as PersonaPage);
    return;
  }
  props.onUpdateCurrentPage({
    ...(props.currentPage ?? { pageType: props.currentPageType }),
    tabs: [{ ...defaultTabTemplate(), layout: forced }],
  } as PersonaPage);
}

function handleLayoutChange(next: WidgetConfig[]): void {
  writeLayout(next);
}

function convertObjectLayout(): void {
  writeLayout(defaultLayout.value);
}

async function resetFromButton(): Promise<void> {
  const resetLayout = forceFullWidth(defaultLayout.value);
  const tabs = props.currentPage?.tabs;
  const nextTabs =
    Array.isArray(tabs) && tabs.length > 0
      ? tabs
      : [defaultTabTemplate()];
  props.onUpdateCurrentPage({
    ...(props.currentPage ?? {}),
    pageType: props.currentPageType,
    tabs: nextTabs.map((rawTab, index) =>
      index === 0 ? { ...asCustomizeTab(rawTab), layout: resetLayout } : rawTab,
    ),
  } as PersonaPage);
  await editor.resetFromButton();
}

const greeting = computed(() => t('marketplace.greeting', { name: authStore.displayName }));
</script>

<template>
  <div data-testid="marketplace-editor">
    <CustomizePageHeader
      :page-label="currentPageType"
      :persona-name="personaName"
      :disable-save="editor.disableSave.value"
      :saving="editor.saving.value"
      @save="editor.saveFromButton()"
      @reset="resetFromButton()"
      @close="$emit('close')"
    />
    <div class="marketplace-editor__banner" data-testid="marketplace-greeting">
      <h2>{{ greeting }}</h2>
      <p>{{ t('marketplace.subtitle') }}</p>
    </div>
    <Input.Search
      class="marketplace-editor__search"
      data-testid="marketplace-search"
      :placeholder="t('marketplace.searchPlaceholder')"
      :disabled="true"
    />
    <ObjectLayoutNotice
      v-if="objectLayout !== null"
      :stored-value="objectLayout"
      @convert="convertObjectLayout"
    />
    <DetailGridEditor
      v-else
      :layout="displayLayout"
      :cols="TAB_GRID_MAX_COLUMNS"
      :row-height="MARKETPLACE_ROW_HEIGHT"
      :row-gap="24"
      :resizable="false"
      :removable="false"
      :force-full-width="true"
      :widget-title="widgetTitle"
      @layout-change="handleLayoutChange"
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

<style scoped>
.marketplace-editor__banner {
  margin-bottom: 16px;
}
.marketplace-editor__banner h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.marketplace-editor__banner p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
.marketplace-editor__search {
  margin-bottom: 16px;
}
</style>
