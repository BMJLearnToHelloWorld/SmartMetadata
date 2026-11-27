<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { FilterOutlined } from '@ant-design/icons-vue';
import { Button, Tag, Typography } from 'ant-design-vue';
import { estateCategory } from '@/catalog/browseEstate';
import {
  buildQueryBarChips,
  removeBrowseLevel,
  type QueryBarBrowseLevel,
  type QueryBarChip,
} from '@/catalog/exploreQueryBar';
import type { FacetId } from '@/catalog/searchFacets';
import type { SearchFilters } from '@/catalog/searchQuery';

const props = defineProps<{
  filters: SearchFilters;
  estateId: string;
  emptyText?: string;
}>();

const emit = defineEmits<{
  remove: [id: FacetId, value: string];
  browse: [next: { filters: SearchFilters; estateId: string }];
  clear: [];
}>();

const { t, te } = useI18n();

function fieldLabel(id: string): string {
  return t(`explore.facets.${id}`);
}

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function categoryTitle(id: string): string {
  const category = estateCategory(id);
  return category ? t(category.titleKey) : id;
}

const chips = computed(() =>
  buildQueryBarChips(props.filters, props.estateId, {
    browseIn: t('explore.browseIn'),
    categoryTitle,
    fieldLabel,
    typeLabel: t('explore.queryBarType'),
    entityLabel,
    noEntity: (label) => t('explore.noEntity', { entity: label }),
    schemaLabel: t('explore.queryBarSchema'),
  }),
);

const hasChips = computed(() => chips.value.length > 0);

function onRemove(chip: QueryBarChip): void {
  if (chip.kind === 'browse') {
    emit('browse', removeBrowseLevel(props.filters, props.estateId, chip.field as QueryBarBrowseLevel));
    return;
  }
  if (chip.value !== undefined) {
    emit('remove', chip.field as FacetId, chip.value);
  }
}
</script>

<template>
  <div v-if="hasChips || emptyText" class="query-bar" data-testid="explore-query-filter-chips">
    <Typography.Text class="query-bar__label">
      <FilterOutlined class="query-bar__funnel" aria-hidden="true" />
      {{ t('explore.queryBarLabel') }}
    </Typography.Text>
    <Typography.Text v-if="!hasChips && emptyText" type="secondary" data-testid="query-bar-empty-text">
      {{ emptyText }}
    </Typography.Text>
    <Tag
      v-for="chip in chips"
      :key="chip.key"
      closable
      :class="['query-bar__chip', chip.kind === 'browse' ? 'query-bar__chip--browse' : 'query-bar__chip--filter']"
      :data-testid="chip.kind === 'browse' ? `browse-chip-${chip.field}` : `search-active-${chip.field}-${chip.value}`"
      @close="onRemove(chip)"
    >
      <span class="query-bar__chip-label">{{ chip.label }}</span>
      <span>{{ ' ' + chip.display }}</span>
    </Tag>
    <Button
      v-if="hasChips"
      type="link"
      size="small"
      class="query-bar__clear"
      data-testid="search-clear-filters"
      :aria-label="t('explore.clearFiltersHelp')"
      @click="emit('clear')"
    >
      {{ t('explore.clearAllConditions') }}
    </Button>
  </div>
</template>

<style scoped>
.query-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--sm-border-radius);
  /* Product theme: the same primary wash already used on Explore selected
     chrome (left-tab active, estate count). Sits inside the toolbar card
     which uses the pane surface tokens (--sm-bg-container, --sm-border-secondary). */
  background: var(--sm-color-primary-bg);
}
.query-bar__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sm-text-tertiary);
}
.query-bar__funnel {
  font-size: 14px;
}
.query-bar__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-inline-end: 0;
}
.query-bar__chip-label {
  font-weight: 400;
  color: var(--sm-text-tertiary);
}
.query-bar__clear {
  margin-left: auto;
  padding-inline: 0;
}
</style>
