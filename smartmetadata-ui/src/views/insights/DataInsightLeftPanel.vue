<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import SmIcon from '@/components/shared/SmIcon.vue';
import { INSIGHTS_TABS } from '@/catalog/insightsTabs';

const props = defineProps<{ currentKey: string }>();

const { t } = useI18n();

/**
 * Pin DataInsightLeftPanel.tsx:33-48 + DataInsightClassBase.ts:38-52
 * (getLeftSideBar()): exactly these three tabs, in this order, each a
 * link to its tab route with the current tab highlighted. Online Users
 * is a separate pin page, not a Data Insight tab, so it is not listed.
 * Pin icons are custom SVGs (data-asset.svg / app-analytics.svg /
 * kpi.svg); the product resolves tab icons through the navIcons bridge
 * (see layouts/navIcons.ts) like every other view icon.
 */
const LEFT_TAB_KEYS = ['data-assets', 'app-analytics', 'kpis'] as const;

const TAB_ICON_KEYS: Record<(typeof LEFT_TAB_KEYS)[number], string> = {
  'data-assets': 'insights-data-assets',
  'app-analytics': 'insights-app-analytics',
  kpis: 'insights-kpis',
};

const leftTabs = computed(() =>
  LEFT_TAB_KEYS.flatMap((key) => {
    const tab = INSIGHTS_TABS.find((entry) => entry.key === key);
    return tab ? [{ ...tab, iconKey: TAB_ICON_KEYS[key] }] : [];
  }),
);
</script>

<template>
  <nav
    :aria-label="t('insights.dataInsight')"
    class="data-insight-left-panel"
    data-testid="data-insight-left-panel"
  >
    <ul class="data-insight-left-panel__list">
      <li v-for="tab in leftTabs" :key="tab.key">
        <RouterLink
          :to="tab.path"
          :data-testid="`data-insight-tab-${tab.key}`"
          :aria-current="tab.key === props.currentKey ? 'page' : undefined"
          class="data-insight-left-panel__item"
          :class="{ 'data-insight-left-panel__item--current': tab.key === props.currentKey }"
        >
          <SmIcon :icon-key="tab.iconKey" test-id="data-insight-tab-icon" />
          <span>{{ t(tab.titleKey) }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.data-insight-left-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.data-insight-left-panel__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 12px;
  border-radius: 6px;
  color: var(--sm-text-secondary);
  font-size: 14px;
  text-decoration: none;
}
.data-insight-left-panel__item:hover {
  background-color: var(--sm-row-hover-bg);
}
.data-insight-left-panel__item--current {
  background-color: var(--sm-color-primary-bg);
  color: var(--sm-brand);
  font-weight: 600;
}
</style>
