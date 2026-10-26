<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Select } from 'ant-design-vue';
import { CHIP_FACET_IDS, type FacetId, type SearchFacet } from '@/catalog/searchFacets';
import type { SearchFilters } from '@/catalog/searchQuery';

const props = defineProps<{
  facets: SearchFacet[];
  filters: SearchFilters;
}>();

const emit = defineEmits<{
  change: [id: FacetId, values: string[]];
}>();

const { t, te } = useI18n();

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function facetTitle(id: FacetId): string {
  return t(`explore.facets.${id}`);
}

const chips = computed(() =>
  CHIP_FACET_IDS.map((id) => {
    const facet = props.facets.find((item) => item.id === id);
    return {
      id,
      title: facetTitle(id),
      options: (facet?.buckets ?? []).map((bucket) => ({
        value: bucket.key,
        label: `${id === 'entityType' ? entityLabel(bucket.key) : bucket.key} (${bucket.count})`,
      })),
    };
  }),
);

function onChange(id: FacetId, value: unknown): void {
  const values = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  emit('change', id, values);
}
</script>

<template>
  <div class="chips" data-testid="explore-chips">
    <Select
      v-for="chip in chips"
      :key="chip.id"
      :data-testid="`explore-chip-${chip.id}`"
      class="chips__select"
      mode="multiple"
      allow-clear
      max-tag-count="responsive"
      size="small"
      :placeholder="chip.title"
      :value="filters[chip.id] ?? []"
      :options="chip.options"
      :not-found-content="t('explore.chipEmpty')"
      :aria-label="chip.title"
      @change="(value) => onChange(chip.id, value)"
    />
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.chips__select {
  min-width: 132px;
  max-width: 220px;
}
</style>
