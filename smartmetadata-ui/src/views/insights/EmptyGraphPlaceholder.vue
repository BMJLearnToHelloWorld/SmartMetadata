<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { DatabaseOutlined } from '@ant-design/icons-vue';
import { Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * Pin components/DataInsight/EmptyGraphPlaceholder.tsx:27-58: a database
 * icon, "Adding a new Data Insight is easy, just give it a spin!", and a
 * "Still need help? Refer to our docs for more information." footer whose
 * docs word links to DATA_INSIGHT_DOCS. Shown when a Data Insight card
 * has no data — both while its siblings load and after a fetch that
 * returns nothing (pin DataInsightChartCard.tsx:620-645 renders
 * SkeletonParagraph while loading, this placeholder otherwise).
 *
 * Rebase note: #343's version wrapped the shared NoDataPlaceholder;
 * the merged component renders pin's markup directly, with the testid
 * and i18n keys from P2 (`insights.pipelineEmpty` / `insights.emptyDocs*`).
 */
withDefaults(defineProps<{ testId?: string }>(), { testId: 'empty-graph-placeholder' });
const { t } = useI18n();

/**
 * Pin docs.constants.ts via DocumentationLinksClassBase: the default docs
 * base (https://docs.open-metadata.org/latest/) + 'how-to-guides/data-insights'.
 */
const DATA_INSIGHT_DOCS = 'https://docs.open-metadata.org/latest/how-to-guides/data-insights';
</script>

<template>
  <div class="empty-graph-placeholder" :data-testid="testId">
    <DatabaseOutlined class="empty-graph-placeholder__icon" />
    <Typography.Paragraph class="empty-graph-placeholder__text">
      {{ t('insights.pipelineEmpty') }}
    </Typography.Paragraph>
    <Typography.Paragraph class="empty-graph-placeholder__docs">
      <i18n-t keypath="insights.emptyDocs" tag="span">
        <template #docs>
          <a
            :aria-label="t('insights.emptyDocsLink')"
            :href="DATA_INSIGHT_DOCS"
            rel="noreferrer"
            target="_blank"
          >
            {{ t('insights.emptyDocsLink') }}
          </a>
        </template>
      </i18n-t>
    </Typography.Paragraph>
  </div>
</template>

<style scoped>
/* Pin EmptyGraphPlaceholder: min-h-60 (240px) rounded surface. */
.empty-graph-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: 24px 16px;
  text-align: center;
}
.empty-graph-placeholder__icon {
  margin-bottom: 12px;
  font-size: 32px;
  /* Muted icon tone via the product token (tokens.test.ts forbids raw
   * hex in scoped styles); same token as EmptyPlaceholder's icon. */
  color: var(--sm-text-tertiary);
}
.empty-graph-placeholder__text {
  margin-bottom: 4px;
}
.empty-graph-placeholder__docs {
  margin-bottom: 0;
}
</style>
