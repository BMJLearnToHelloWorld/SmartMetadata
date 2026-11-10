<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { AppstoreOutlined, SettingOutlined, UnorderedListOutlined } from '@ant-design/icons-vue';
import { Button } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { TopicsViewMode } from './useTopicsView';

/**
 * The "Topics to catch up on" heading, its two view controls and the
 * entry point to the persona's layout editor, ported from the official
 * framework (openmetadata-ui `components/MyData/TopicsSectionHeader.tsx`).
 *
 * Split from the page so the page keeps one job — owning collapse and
 * view state — rather than also carrying this markup's share of the
 * branching. The Customize button renders only when `onCustomize` is
 * provided (an admin with a persona in play); the toggle-all button
 * is disabled when the layout is empty.
 */
const props = defineProps<{
  isEveryWidgetCollapsed: boolean;
  isLayoutEmpty: boolean;
  viewMode: TopicsViewMode;
  onCustomize?: () => void;
}>();

const emit = defineEmits<{
  (event: 'toggle-all'): void;
  (event: 'view-mode-change', mode: TopicsViewMode): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="topics-section-header"
    data-tour-step="topics-to-catch-up-on"
    data-testid="topics-section-header"
  >
    <div class="topics-section-header__copy">
      <h2 class="topics-section-header__title">{{ t('home.topicsTitle') }}</h2>
      <p class="topics-section-header__subtitle">{{ t('home.topicsToCatchUpOnSubtitle') }}</p>
    </div>
    <div class="topics-section-header__controls">
      <Button
        data-testid="toggle-all-widgets"
        :disabled="props.isLayoutEmpty"
        @click="emit('toggle-all')"
      >
        {{ t(props.isEveryWidgetCollapsed ? 'home.expandAll' : 'home.collapseAll') }}
      </Button>
      <div class="topics-section-header__view-toggle" role="group" :aria-label="t('crud.view')">
        <Button
          data-testid="topics-list-view"
          :type="props.viewMode === 'list' ? 'primary' : 'default'"
          :aria-label="t('home.listView')"
          @click="emit('view-mode-change', 'list')"
        >
          <template #icon><UnorderedListOutlined /></template>
        </Button>
        <Button
          data-testid="topics-grid-view"
          :type="props.viewMode === 'grid' ? 'primary' : 'default'"
          :aria-label="t('home.gridView')"
          @click="emit('view-mode-change', 'grid')"
        >
          <template #icon><AppstoreOutlined /></template>
        </Button>
      </div>
      <Button
        v-if="props.onCustomize"
        data-testid="customize-home-page"
        @click="props.onCustomize?.()"
      >
        <template #icon><SettingOutlined /></template>
        {{ t('home.customize') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.topics-section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.topics-section-header__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.topics-section-header__subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.topics-section-header__controls {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
}
.topics-section-header__view-toggle {
  display: inline-flex;
}
.topics-section-header__view-toggle :deep(.ant-btn:first-child) {
  border-start-end-radius: 0;
  border-end-end-radius: 0;
}
.topics-section-header__view-toggle :deep(.ant-btn:last-child) {
  border-start-start-radius: 0;
  border-end-start-radius: 0;
  margin-inline-start: -1px;
}
</style>
