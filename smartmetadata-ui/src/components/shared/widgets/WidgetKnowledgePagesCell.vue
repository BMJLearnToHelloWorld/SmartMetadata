/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
import { listKnowledgePages } from '@/api/contextCenter';
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';
import type { KnowledgePage } from '@/types/contextCenter';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Official KnowledgePages widget
 * (openmetadata-ui/.../KnowledgeCenter/KnowledgePages/KnowledgePages.tsx):
 * the pages linked to this entity, ten at most, articles opening in the
 * app and quick links in a new window. An entity with no pages shows
 * nothing at all — official removes the widget from the grid — and a
 * failed load stays silent for the same reason. No write, no permission.
 */
const PAGE_SIZE = 10;

const props = defineProps<{
  entityId: string;
  entityType: string;
}>();

const { t } = useI18n();
const pages = ref<KnowledgePage[]>([]);
const total = ref(0);
const loading = ref(true);
const empty = ref(false);

onMounted(async () => {
  try {
    const result = await listKnowledgePages({
      entityId: props.entityId,
      entityType: props.entityType,
      limit: PAGE_SIZE,
    });
    pages.value = result.data;
    total.value = result.total ?? 0;
    empty.value = result.data.length === 0;
  } catch {
    empty.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <a-spin v-if="loading" data-testid="knowledge-pages-loading" />
  <div v-else-if="!empty" class="knowledge-pages-cell" data-testid="knowledge-pages">
    <div class="knowledge-pages-cell__header">
      <span class="knowledge-pages-cell__title">{{ t('label.context-center') }}</span>
      <RouterLink
        v-if="total > 10"
        data-testid="knowledge-pages-view-all"
        :to="{
          name: 'context-center-filter',
          query: { entityId: props.entityId, entityType: props.entityType },
        }"
      >
        {{ t('label.view-all') }}
      </RouterLink>
    </div>
    <a-list :data-source="pages" size="small">
      <template #renderItem="{ item }: { item: KnowledgePage }">
        <a-list-item :key="item.id" data-testid="knowledge-pages-row">
          <RouterLink
            v-if="item.pageType === 'Article'"
            :to="{ name: 'context-center-article', params: { fqn: item.fullyQualifiedName } }"
          >
            {{ item.displayName || item.name }}
          </RouterLink>
          <a
            v-else
            :href="getSafeHttpUrl(item.pageUrl) ?? '#'"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ item.displayName || item.name }}
          </a>
        </a-list-item>
      </template>
    </a-list>
  </div>
</template>

<style scoped>
.knowledge-pages-cell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.knowledge-pages-cell__title {
  font-weight: 600;
}
</style>
