<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Alert, Radio, Skeleton, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { EXPORT_ALL_ASSETS_LIMIT } from '@/api/search';
import FormModal from '@/components/shared/FormModal.vue';

/**
 * Official ExploreExportScopeModal (ExploreV1.component.tsx:182-360):
 * the "Export" modal lets the user choose visible-page vs. all-matching-
 * assets scope. The visible card shows the active tab's asset count in
 * search mode, else the current page's result count; the all card shows
 * the size-0 count. Export is disabled while exporting, while counts
 * load, when the all-assets count exceeds EXPORT_ALL_ASSETS_LIMIT
 * (200000), or when the visible scope has no tab count in search mode.
 * A failed export stays in the modal with the inline error (pin test:
 * "shows inline export error in modal and keeps modal open").
 */
export type ExportScope = 'visible' | 'all';

defineProps<{
  open: boolean;
  exportScope: ExportScope;
  isSearchMode: boolean;
  isCountLoading: boolean;
  tabAssetsCount?: number;
  pageResultCount: number;
  allAssetsCount?: number;
  activeTabLabel: string;
  isExporting: boolean;
  isAllAssetsLimitExceeded: boolean;
  isTabScopeDisabled: boolean;
  exportError?: string;
}>();

const emit = defineEmits<{
  'update:exportScope': [scope: ExportScope];
  cancel: [];
  ok: [];
}>();

const { t } = useI18n();
</script>

<template>
  <FormModal
    :open="open"
    :title="t('explore.export')"
    size="wide"
    :ok-text="t('explore.export')"
    :confirm-loading="isExporting"
    :ok-disabled="isExporting || isCountLoading || isAllAssetsLimitExceeded || isTabScopeDisabled"
    test-id="export-scope-modal"
    @ok="emit('ok')"
    @cancel="emit('cancel')"
  >
    <Typography.Paragraph type="secondary">{{ t('explore.exportDescription') }}</Typography.Paragraph>
    <Alert
      v-if="isAllAssetsLimitExceeded"
      type="error"
      show-icon
      data-testid="export-scope-limit-alert"
      :message="t('explore.exportLimitExceeded', { limit: EXPORT_ALL_ASSETS_LIMIT })"
      class="export-scope__alert"
    />
    <Alert
      v-if="exportError"
      type="error"
      show-icon
      data-testid="export-scope-error"
      :message="exportError"
      class="export-scope__alert"
    />
    <Typography.Text strong>{{ t('explore.exportScope') }}</Typography.Text>
    <div class="export-scope__options" role="radiogroup" :aria-label="t('explore.exportScope')">
      <div
        role="radio"
        :aria-checked="exportScope === 'visible'"
        tabindex="0"
        data-testid="export-scope-visible-card"
        class="export-scope__card"
        :class="{ 'export-scope__card--selected': exportScope === 'visible' }"
        @click="emit('update:exportScope', 'visible')"
        @keydown.enter="emit('update:exportScope', 'visible')"
        @keydown.space.prevent="emit('update:exportScope', 'visible')"
      >
        <Radio :checked="exportScope === 'visible'" :aria-label="t('explore.exportVisibleResults')" />
        <div>
          <Typography.Text strong>
            {{ isSearchMode ? activeTabLabel : t('explore.exportVisibleResults') }}
            <span data-testid="export-scope-visible-count">
              <Skeleton v-if="isSearchMode && isCountLoading" :paragraph="false" active />
              <template v-else>
                ({{ isSearchMode ? (tabAssetsCount ?? '—') : pageResultCount }} {{ t('explore.exportResults') }})
              </template>
            </span>
          </Typography.Text>
          <Typography.Paragraph type="secondary">
            {{ t('explore.exportVisibleDescription', { dataAssetType: activeTabLabel }) }}
          </Typography.Paragraph>
        </div>
      </div>
      <div
        role="radio"
        :aria-checked="exportScope === 'all'"
        tabindex="0"
        data-testid="export-scope-all-card"
        class="export-scope__card"
        :class="{ 'export-scope__card--selected': exportScope === 'all' }"
        @click="emit('update:exportScope', 'all')"
        @keydown.enter="emit('update:exportScope', 'all')"
        @keydown.space.prevent="emit('update:exportScope', 'all')"
      >
        <Radio :checked="exportScope === 'all'" :aria-label="t('explore.exportAllAssets')" />
        <div>
          <Typography.Text strong>
            {{ t('explore.exportAllAssets') }}
            <span v-if="allAssetsCount !== undefined" data-testid="export-scope-all-count">
              <Skeleton v-if="isCountLoading" :paragraph="false" active />
              <template v-else> ({{ allAssetsCount }} {{ t('explore.exportResults') }}) </template>
            </span>
            <span v-else-if="isCountLoading" data-testid="export-scope-all-count">
              <Skeleton :paragraph="false" active />
            </span>
          </Typography.Text>
          <Typography.Paragraph type="secondary">{{ t('explore.exportAllDescription') }}</Typography.Paragraph>
        </div>
      </div>
    </div>
  </FormModal>
</template>

<style scoped>
.export-scope__alert {
  margin-bottom: 12px;
}
.export-scope__options {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}
.export-scope__card {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  cursor: pointer;
}
.export-scope__card--selected {
  border-color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
}
@media (max-width: 640px) {
  .export-scope__options {
    flex-direction: column;
  }
}
</style>
