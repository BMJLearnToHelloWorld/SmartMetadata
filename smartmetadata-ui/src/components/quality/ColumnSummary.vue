<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ColumnSummary on the SingleColumnProfile path: name, data type,
  description, glossary terms, and classification tags.
  Vue3 + ant-design-vue. No CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, Typography } from 'ant-design-vue';
import type { ColumnProfileRecord, ColumnTagRef } from '@/quality/columnProfile';
import { entityDisplayName } from '@/quality/columnProfile';

const props = defineProps<{
  column: ColumnProfileRecord;
}>();

const { t } = useI18n();

const DESCRIPTION_MAX = 184;

const description = computed(() => {
  const text = props.column.description ?? '';
  return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX)}...` : text;
});

const glossary = computed(() =>
  (props.column.tags ?? []).filter((tag) => (tag.source ?? '').toLowerCase() === 'glossary'),
);
const classification = computed(() =>
  (props.column.tags ?? []).filter((tag) => (tag.source ?? '').toLowerCase() !== 'glossary'),
);

function tagLabel(tag: ColumnTagRef): string {
  return tag.tagFQN;
}

function capped(tags: ColumnTagRef[]): ColumnTagRef[] {
  return tags.slice(0, 3);
}
</script>

<template>
  <Card class="column-summary" data-testid="column-summary">
    <template #title>
      <div class="column-summary__title">
        <span>{{ entityDisplayName(column) }}</span>
        <Typography.Text type="secondary" class="column-summary__type">{{ column.dataType }}</Typography.Text>
      </div>
    </template>
    <Typography.Paragraph v-if="description" type="secondary">{{ description }}</Typography.Paragraph>
    <div class="column-summary__row">
      <Typography.Text type="secondary">{{ t('label.glossary-term-plural') }}</Typography.Text>
      <span>{{ capped(glossary).map(tagLabel).join(', ') || '—' }}</span>
    </div>
    <div class="column-summary__row">
      <Typography.Text type="secondary">{{ t('label.tag-plural') }}</Typography.Text>
      <span>{{ capped(classification).map(tagLabel).join(', ') || '—' }}</span>
    </div>
  </Card>
</template>

<style scoped>
.column-summary__title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.column-summary__type {
  font-size: 12px;
}
.column-summary__row {
  display: grid;
  grid-template-columns: minmax(120px, 30%) 1fr;
  gap: 8px;
  margin-top: 8px;
}
</style>
