<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';

/**
 * Pin EmptyGraphPlaceholder (openmetadata-ui components/DataInsight/
 * EmptyGraphPlaceholder.tsx): the empty state of every Data Insight
 * chart and web table — "Adding a new Data Insight is easy, just give
 * it a spin!" plus a docs footer. The docs link is pin's
 * DATA_INSIGHT_DOCS (constants/docs.constants.ts ->
 * utils/DocumentationLinksClassBase.ts:52, docs base
 * https://docs.open-metadata.org/latest/).
 */
const { t } = useI18n();

const DATA_INSIGHT_DOCS_URL = 'https://docs.open-metadata.org/latest/how-to-guides/data-insights';

const emptyText = computed(() =>
  t('query.addingNewEasy', { entity: t('insights.dataInsight') }),
);
</script>

<template>
  <div class="empty-graph-placeholder">
    <NoDataPlaceholder test-id="no-data-placeholder" :description="emptyText">
      <template #footer>
        <p>
          {{ t('query.referToDocsBefore') }}<a :href="DATA_INSIGHT_DOCS_URL" target="_blank" rel="noopener noreferrer">{{ t('query.docs') }}</a>{{ t('query.referToDocsAfter') }}
        </p>
      </template>
    </NoDataPlaceholder>
  </div>
</template>

<style scoped>
/* Pin `tw:min-h-60` (15rem) on the placeholder shell. */
.empty-graph-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}
</style>
