<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Empty, Tag, Typography } from 'ant-design-vue';
import { isDetailWired } from '@/catalog/entityRoutes';
import { entityTypeColor } from '@/catalog/searchHits';
import type { SearchHit } from '@/types/api';

const props = defineProps<{
  hit: SearchHit | null;
}>();

const emit = defineEmits<{
  open: [hit: SearchHit];
}>();

const { t, te } = useI18n();

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

const glossaryTags = computed(() => (props.hit?.tags ?? []).filter((tag) => tag.source === 'Glossary'));
const classificationTags = computed(() =>
  (props.hit?.tags ?? []).filter((tag) => tag.source !== 'Glossary'),
);

const overviewRows = computed(() => {
  const hit = props.hit;
  if (!hit) {
    return [];
  }
  return [
    { key: 'dataType', label: t('explore.dataType'), value: hit.dataType },
    { key: 'table', label: t('explore.table'), value: hit.tableName },
    { key: 'service', label: t('asset.fields.service'), value: hit.serviceName },
    { key: 'serviceType', label: t('asset.fields.serviceType'), value: hit.serviceType },
    { key: 'database', label: t('asset.fields.database'), value: hit.databaseName },
    { key: 'schema', label: t('asset.fields.schema'), value: hit.schemaName },
    { key: 'constraint', label: t('explore.constraint'), value: hit.constraint },
  ].filter((row) => Boolean(row.value));
});
</script>

<template>
  <aside class="preview" data-testid="explore-preview">
    <Typography.Text strong>{{ t('explore.overview') }}</Typography.Text>
    <Empty
      v-if="!hit"
      data-testid="explore-preview-empty"
      :description="t('explore.selectAsset')"
    >
      <template #description>
        <Typography.Paragraph type="secondary">{{ t('explore.selectAssetHint') }}</Typography.Paragraph>
      </template>
    </Empty>
    <template v-else>
      <div class="preview__head">
        <Tag :color="entityTypeColor(hit.entityType)">{{ entityLabel(hit.entityType) }}</Tag>
        <Typography.Title :level="5" class="preview__name">{{ hit.displayName || hit.name }}</Typography.Title>
      </div>
      <Typography.Paragraph type="secondary" class="preview__fqn">{{ hit.fullyQualifiedName }}</Typography.Paragraph>
      <section class="preview__block" data-testid="explore-preview-description">
        <Typography.Text type="secondary">{{ t('asset.fields.description') }}</Typography.Text>
        <Typography.Paragraph>{{ hit.description || t('explore.noDescription') }}</Typography.Paragraph>
      </section>
      <section v-if="overviewRows.length" class="preview__block" data-testid="explore-preview-overview">
        <Typography.Text type="secondary">{{ t('explore.overview') }}</Typography.Text>
        <dl class="preview__dl">
          <template v-for="row in overviewRows" :key="row.key">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>
      </section>
      <section class="preview__block" data-testid="explore-preview-owners">
        <Typography.Text type="secondary">{{ t('asset.fields.owners') }}</Typography.Text>
        <Typography.Paragraph v-if="!hit.owners.length">{{ t('explore.noOwners') }}</Typography.Paragraph>
        <div v-else class="preview__tags">
          <Tag v-for="owner in hit.owners" :key="owner.name">{{ owner.displayName || owner.name }}</Tag>
        </div>
      </section>
      <section class="preview__block" data-testid="explore-preview-domains">
        <Typography.Text type="secondary">{{ t('asset.fields.domains') }}</Typography.Text>
        <Typography.Paragraph v-if="!hit.domains?.length">{{ t('explore.noDomains') }}</Typography.Paragraph>
        <div v-else class="preview__tags">
          <Tag v-for="domain in hit.domains" :key="domain.name">{{ domain.displayName || domain.name }}</Tag>
        </div>
      </section>
      <section class="preview__block" data-testid="explore-preview-tier">
        <Typography.Text type="secondary">{{ t('explore.facets.tier') }}</Typography.Text>
        <Typography.Paragraph>{{ hit.tier || t('explore.noTier') }}</Typography.Paragraph>
      </section>
      <section class="preview__block" data-testid="explore-preview-glossary">
        <Typography.Text type="secondary">{{ t('explore.glossaryTerms') }}</Typography.Text>
        <Typography.Paragraph v-if="!glossaryTags.length">{{ t('explore.noGlossary') }}</Typography.Paragraph>
        <div v-else class="preview__tags">
          <Tag v-for="tag in glossaryTags" :key="tag.tagFQN">{{ tag.name }}</Tag>
        </div>
      </section>
      <section class="preview__block" data-testid="explore-preview-tags">
        <Typography.Text type="secondary">{{ t('asset.fields.tags') }}</Typography.Text>
        <Typography.Paragraph v-if="!classificationTags.length">{{ t('explore.noTags') }}</Typography.Paragraph>
        <div v-else class="preview__tags">
          <Tag v-for="tag in classificationTags" :key="tag.tagFQN">{{ tag.name }}</Tag>
        </div>
      </section>
      <section class="preview__block" data-testid="explore-preview-products">
        <Typography.Text type="secondary">{{ t('explore.facets.dataProduct') }}</Typography.Text>
        <Typography.Paragraph v-if="!hit.dataProducts?.length">{{ t('explore.noDataProducts') }}</Typography.Paragraph>
        <div v-else class="preview__tags">
          <Tag v-for="product in hit.dataProducts" :key="product.name">{{ product.displayName || product.name }}</Tag>
        </div>
      </section>
      <Typography.Text v-if="!isDetailWired(hit.entityType)" type="secondary">
        {{ t('explore.unwired') }}
      </Typography.Text>
      <Button
        v-else
        type="primary"
        data-testid="explore-preview-open"
        @click="emit('open', hit)"
      >
        {{ t('explore.openAsset') }}
      </Button>
    </template>
  </aside>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100%;
}
.preview__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.preview__name {
  margin: 0;
}
.preview__fqn,
.preview__block :deep(.ant-typography) {
  margin-bottom: 4px;
}
.preview__block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.preview__dl {
  display: grid;
  grid-template-columns: 112px 1fr;
  gap: 4px 8px;
  margin: 4px 0 0;
}
.preview__dl dt {
  color: var(--sm-text-tertiary, #535862);
  font-size: 12px;
}
.preview__dl dd {
  margin: 0;
  font-size: 14px;
}
.preview__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
