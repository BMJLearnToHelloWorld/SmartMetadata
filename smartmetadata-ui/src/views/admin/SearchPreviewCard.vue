<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  View-local preview result card. No product ExploreSearchCard exists;
  this card carries the fields the preview surfaces: the entity icon
  and name, the fully qualified name, highlight fragments with match
  emphasis, and — only while ranking details are on — the score,
  matched queries, and the top-level explanation summary. The full
  score-breakdown decomposition of the official card is not ported
  (see the implementation report).
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, Tag, Typography } from 'ant-design-vue';
import { asRecord, asString } from '@/api/json';
import type { PreviewSearchHit } from '@/api/search';
import SearchEntityIcon from '@/components/shared/SearchEntityIcon.vue';

const props = defineProps<{
  hit: PreviewSearchHit;
  showRankingDetails: boolean;
}>();
const { t } = useI18n();

const entityType = computed(() => asString(props.hit.source.entityType) || '');
const displayName = computed(
  () =>
    asString(props.hit.source.displayName) ||
    asString(props.hit.source.name) ||
    asString(props.hit.source.fullyQualifiedName) ||
    '',
);
const fqn = computed(() => asString(props.hit.source.fullyQualifiedName) || '');
const description = computed(() => asString(props.hit.source.description) || '');

/** Escape the fragment, then restore only <em> match markers. */
function renderHighlight(fragment: string): string {
  return fragment
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;em&gt;/g, '<em>')
    .replace(/&lt;\/em&gt;/g, '</em>');
}

const highlightFragments = computed(() => {
  if (!props.hit.highlight) {
    return [];
  }
  return Object.values(props.hit.highlight).flat();
});

const explanationSummary = computed(() => {
  const explanation = asRecord(props.hit.explanation);
  if (!explanation) {
    return null;
  }
  const descriptionText = asString(explanation.description);
  const value = explanation.value;
  if (descriptionText) {
    return value === undefined ? descriptionText : `${descriptionText} (${String(value)})`;
  }
  const serialized = JSON.stringify(props.hit.explanation);
  return serialized.length > 1000 ? `${serialized.slice(0, 1000)}…` : serialized;
});
</script>

<template>
  <Card size="small" class="search-preview-card" data-testid="searched-data-card">
    <div class="search-preview-card__head">
      <SearchEntityIcon :entity-type="entityType" :size="24" />
      <div class="search-preview-card__titles">
        <Typography.Text strong>{{ displayName }}</Typography.Text>
        <Typography.Text type="secondary">{{ fqn }}</Typography.Text>
      </div>
      <span v-if="showRankingDetails && hit.score !== undefined" class="search-preview-card__score">
        <Typography.Text type="secondary">{{ t('settings.searchPrefs.score') }}</Typography.Text>
        <Typography.Text strong>{{ hit.score.toFixed(4) }}</Typography.Text>
      </span>
    </div>
    <Typography.Paragraph v-if="description" :ellipsis="{ rows: 2 }" type="secondary">
      {{ description }}
    </Typography.Paragraph>
    <!-- eslint-disable-next-line vue/no-v-html -- fragments are escaped; only <em> markers are restored -->
    <Typography.Paragraph
      v-for="(fragment, index) in highlightFragments"
      :key="index"
      type="secondary"
      v-html="renderHighlight(fragment)"
    />
    <div v-if="showRankingDetails" class="search-preview-card__details">
      <div v-if="hit.matchedQueries?.length" class="search-preview-card__matched">
        <Tag v-for="query in hit.matchedQueries" :key="query">{{ query }}</Tag>
      </div>
      <Typography.Paragraph
        v-if="explanationSummary"
        type="secondary"
        data-testid="ranking-score-explanation"
      >
        {{ explanationSummary }}
      </Typography.Paragraph>
    </div>
  </Card>
</template>

<style scoped>
.search-preview-card__head {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.search-preview-card__titles {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.search-preview-card__score {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  align-items: baseline;
}

.search-preview-card__details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-preview-card__matched {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
