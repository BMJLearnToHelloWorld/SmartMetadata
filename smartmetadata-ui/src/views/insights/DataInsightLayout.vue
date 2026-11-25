<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ResizablePanels from '@/components/shared/ResizablePanels.vue';
import DataInsightLeftPanel from './DataInsightLeftPanel.vue';

defineProps<{ tabKey: string }>();

const { t } = useI18n();
</script>

<template>
  <!--
    Pin DataInsightPage.component.tsx:148-184: ResizableLeftPanels with
    firstPanel { minWidth: 280, flex: 0.13 } (the tab nav, titled
    label.data-insight) and secondPanel { minWidth: 800, flex: 0.87 }
    (the shared header + current tab). The product reuses its
    ResizablePanels with collapseSide="first" — the pin
    ResizableLeftPanels shape, where the splitter collapses the left
    panel rather than the content. Routes are unchanged: each tab is
    still its own route (pin's tab switch is itself a route navigation
    to /data-insights/:tab), the layout only renders the nav on all
    three pages and highlights the current tab.
  -->
  <ResizablePanels
    :first-panel="{
      minWidth: 280,
      flex: 0.13,
      className: 'content-resizable-panel-container',
    }"
    :second-panel="{
      minWidth: 800,
      flex: 0.87,
      className: 'content-resizable-panel-container',
    }"
    collapse-side="first"
    class-name="content-height-with-resizable-panel"
  >
    <template #first>
      <div class="data-insight-layout__title">{{ t('insights.dataInsight') }}</div>
      <DataInsightLeftPanel :current-key="tabKey" />
    </template>
    <template #second>
      <slot />
    </template>
  </ResizablePanels>
</template>

<style scoped>
.data-insight-layout__title {
  padding: 16px 16px 12px;
  color: var(--sm-text-primary);
  font-size: 14px;
  font-weight: 600;
}
</style>
