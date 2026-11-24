<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, h, type Component, type VNode } from 'vue';
import { useI18n } from 'vue-i18n';
import { Select } from 'ant-design-vue';
import {
  CHIP_FACET_IDS,
  NULL_OPTION_KEY,
  SUPPORTED_EMPTY_FILTER_FIELDS,
  type FacetId,
  type SearchFacet,
} from '@/catalog/searchFacets';
import type { SearchFilters } from '@/catalog/searchQuery';
import SmIcon from '@/components/shared/SmIcon.vue';
import { serviceTypeIcon } from '@/features/home/serviceTypeIcon';
import { formatTierLabel } from '@/ingestion/tierTags';
import { navIcon } from '@/layouts/navIcons';

const props = withDefaults(
  defineProps<{
    facets: SearchFacet[];
    filters: SearchFilters;
    /** Facet ids to render; defaults to every top-bar chip id. */
    facetIds?: FacetId[];
    /** Facets whose options are currently being searched (loading spinner). */
    searchingFacetIds?: readonly FacetId[];
  }>(),
  { facetIds: () => [...CHIP_FACET_IDS], searchingFacetIds: () => [] },
);

const emit = defineEmits<{
  change: [id: FacetId, values: string[]];
  open: [id: FacetId, open: boolean];
  search: [id: FacetId, text: string];
}>();

const { t, te } = useI18n();

/**
 * Pin ExploreQuickFilters.addOptionIcons: entity-type options carry the
 * entity icon, service-type options the service logo, domain options the
 * domain icon; every other facet's options are plain text (including
 * `service`). The keys below are layouts/navIcons `entity-*` entries;
 * an unmapped type renders text-only rather than a missing-icon marker.
 */
const ENTITY_TYPE_ICON_KEYS: Readonly<Record<string, string>> = {
  table: 'entity-table',
  tableColumn: 'entity-column',
  storedProcedure: 'entity-stored-procedure',
  database: 'entity-database',
  databaseSchema: 'entity-database-schema',
  dashboard: 'entity-dashboard',
  dashboardDataModel: 'entity-dashboard-data-model',
  chart: 'entity-chart',
  pipeline: 'entity-pipeline',
  topic: 'entity-topic',
  mlmodel: 'entity-mlmodel',
  container: 'entity-container',
  searchIndex: 'entity-search-index',
  glossaryTerm: 'entity-glossary-term',
  tag: 'entity-tag',
  dataProduct: 'entity-data-product',
  apiCollection: 'entity-api-collection',
  apiEndpoint: 'entity-api-endpoint',
  metric: 'entity-metric',
  directory: 'entity-directory',
  file: 'entity-file',
  spreadsheet: 'entity-spreadsheet',
  worksheet: 'entity-worksheet',
  page: 'entity-article',
  domain: 'entity-domain',
  query: 'entity-query',
  team: 'entity-team',
  user: 'entity-user',
};

function optionIcon(id: FacetId, key: string): Component | undefined {
  if (id === 'entityType') {
    const iconKey = ENTITY_TYPE_ICON_KEYS[key];
    return iconKey && navIcon(iconKey) ? SmIcon : undefined;
  }
  if (id === 'serviceType') {
    return serviceTypeIcon(key);
  }
  if (id === 'domain') {
    return SmIcon;
  }
  return undefined;
}

function optionIconProps(id: FacetId, key: string): Record<string, string> | undefined {
  if (id === 'entityType') {
    const iconKey = ENTITY_TYPE_ICON_KEYS[key];
    return iconKey && navIcon(iconKey) ? { iconKey } : undefined;
  }
  if (id === 'domain') {
    return { iconKey: 'entity-domain' };
  }
  return undefined;
}

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function facetTitle(id: FacetId): string {
  return t(`explore.facets.${id}`);
}

function optionLabel(id: FacetId, key: string, count: number): string | VNode {
  // Pin renders the tier option with its tier NAME, not the FQN and
  // not startCase: `formatTierLabel` in AdvancedSearchPureUtils.ts
  // (getNameFromFQN, default tiers normalised to `Tier1`).
  const display = id === 'entityType' ? entityLabel(key) : id === 'tier' ? formatTierLabel(key) : key;
  const text = `${display} (${count})`;
  const icon = optionIcon(id, key);
  if (!icon) {
    return text;
  }
  const iconProps = optionIconProps(id, key);
  return h('span', { class: 'chips__option' }, [
    h(icon, iconProps ?? {}),
    h('span', text),
  ]);
}

const chips = computed(() =>
  props.facetIds.map((id) => {
    const facet = props.facets.find((item) => item.id === id);
    const options: Array<{ value: string; label: string | VNode }> = [];
    // Pin's "No X" option (NULL_OPTION_KEY): offered for the
    // SUPPORTED_EMPTY_FILTER_FIELDS only, ahead of the buckets, and
    // shown even when the facet has no buckets yet.
    if (SUPPORTED_EMPTY_FILTER_FIELDS.includes(id)) {
      options.push({
        value: NULL_OPTION_KEY,
        label: t('explore.noEntity', { entity: facetTitle(id) }),
      });
    }
    for (const bucket of facet?.buckets ?? []) {
      options.push({
        value: bucket.key,
        label: optionLabel(id, bucket.key, bucket.count),
      });
    }
    return {
      id,
      title: facetTitle(id),
      options,
      searching: props.searchingFacetIds.includes(id),
    };
  }),
);

function onChange(id: FacetId, value: unknown): void {
  const values = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  emit('change', id, values);
}

function onOpen(id: FacetId, open: boolean): void {
  emit('open', id, open);
}

function onSearch(id: FacetId, text: string): void {
  emit('search', id, text);
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
      show-search
      :filter-option="false"
      :loading="chip.searching"
      :placeholder="chip.title"
      :value="filters[chip.id] ?? []"
      :options="chip.options"
      :not-found-content="t('explore.chipEmpty')"
      :aria-label="chip.title"
      @change="(value) => onChange(chip.id, value)"
      @dropdownVisibleChange="(open: boolean) => onOpen(chip.id, open)"
      @search="(text: string) => onSearch(chip.id, text)"
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
.chips__option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.chips__option svg {
  width: 14px;
  height: 14px;
}
</style>
