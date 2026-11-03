<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { Space } from 'ant-design-vue';

/**
 * In-section navigation for the context-center pages. The global sidebar
 * only lists the five original sections, so this bar keeps the three newer
 * routes (filter, integrations, ai-context) reachable from inside the section
 * without touching the shared sidebar config.
 */
const { t } = useI18n();
const route = useRoute();

const items = computed(() => [
  { name: 'context-center-overview', label: t('nav.overview') },
  { name: 'context-center-articles', label: t('nav.articles') },
  { name: 'context-center-documents', label: t('nav.documents') },
  { name: 'context-center-memories', label: t('nav.memories') },
  { name: 'context-center-filter', label: t('contextCenter.filter') },
  { name: 'context-center-integrations', label: t('contextCenter.integrations') },
  { name: 'context-center-ai-context', label: t('contextCenter.aiContext') },
  { name: 'context-center-archive', label: t('nav.archive') },
]);

function isActive(name: string): boolean {
  if (route.name === name) {
    return true;
  }
  // Detail routes fall back to their list entry.
  if (name === 'context-center-articles' && route.name === 'context-center-article') {
    return true;
  }
  if (
    name === 'context-center-ai-context' &&
    route.name === 'context-center-ai-context-detail'
  ) {
    return true;
  }
  return false;
}
</script>

<template>
  <nav data-testid="context-center-nav" class="context-center-nav">
    <Space wrap>
      <RouterLink
        v-for="item in items"
        :key="item.name"
        :to="{ name: item.name }"
        :class="{ 'context-center-nav__active': isActive(item.name) }"
        :data-testid="`context-center-nav-${item.name}`"
      >
        {{ item.label }}
      </RouterLink>
    </Space>
  </nav>
</template>

<style scoped>
.context-center-nav {
  margin-bottom: 16px;
}

.context-center-nav a {
  color: var(--sm-text-secondary);
}

.context-center-nav__active {
  font-weight: 600;
  color: var(--sm-color-primary);
}
</style>
