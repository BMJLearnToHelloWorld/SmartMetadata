<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Button, Spin, Typography } from 'ant-design-vue';
import { FileTextOutlined, LinkOutlined } from '@ant-design/icons-vue';
import { listKnowledgePages } from '@/api/contextCenter';
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';
import type { KnowledgePage } from '@/types/contextCenter';

/**
 * KnowledgePages fallback cell (D-2 batch 2): the product port of pin
 * `KnowledgePages` as reached through the only fallback resolver in
 * the pin tree (`CommonWidgetClassBase.ts:26-41` — exact / prefix /
 * case-insensitive match on `KNOWLEDGE_ARTICLE` → `KnowledgePages`).
 * Self-fetches `listKnowledgePages({entityId, entityType, limit: 10})`;
 * empty or failed load renders nothing (pin returns null, load
 * failure silent); more than 10 total shows a view-all link to the
 * context-center filter. Articles link to the article page, quick
 * links open in a new tab through the safe-URL helper. This cell is
 * read-only: pin KnowledgePages has no edit action.
 */
const props = withDefaults(
  defineProps<{
    entityId: string;
    entityType: string;
    testId?: string;
  }>(),
  { testId: 'widget-knowledge-pages-cell' },
);

const { t } = useI18n();

const PAGE_SIZE = 10;

const loading = ref(false);
const total = ref(0);
const pages = ref<KnowledgePage[]>([]);

const hasContent = computed(() => pages.value.length > 0);

function displayName(page: KnowledgePage): string {
  return page.displayName || page.name;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await listKnowledgePages({
      entityId: props.entityId,
      entityType: props.entityType,
      limit: PAGE_SIZE,
    });
    pages.value = result.data;
    total.value = result.total ?? 0;
  } catch {
    // Pin KnowledgePages swallows load failures (renders null).
    pages.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div v-if="loading" :data-testid="testId">
    <Spin size="small" />
  </div>
  <div v-else-if="hasContent" :data-testid="testId">
    <Typography.Title :level="5">{{ t('label.contextCenter') }}</Typography.Title>
    <div v-for="page in pages" :key="page.id" class="knowledge-pages__row">
      <RouterLink
        v-if="page.pageType === 'Article'"
        :to="{ name: 'context-center-article', params: { fqn: page.fullyQualifiedName } }"
        data-testid="knowledge-page-article"
      >
        <FileTextOutlined /> {{ displayName(page) }}
      </RouterLink>
      <a
        v-else
        :href="getSafeHttpUrl(page.pageUrl ?? '') ?? undefined"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="knowledge-page-quick-link"
      >
        <LinkOutlined /> {{ displayName(page) }}
      </a>
    </div>
    <RouterLink
      v-if="total > PAGE_SIZE"
      :to="{ name: 'context-center-filter', query: { entityId, entityType } }"
      data-testid="knowledge-pages-view-all"
    >
      <Button type="link" size="small">{{ t('label.viewAll') }}</Button>
    </RouterLink>
  </div>
</template>

<style scoped>
.knowledge-pages__row {
  margin-bottom: 4px;
}
</style>
