<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input, Skeleton } from 'ant-design-vue';
import {
  getModifiedQueryFilterWithSelectedAssets,
  isValidElasticsearchQuery,
} from '@/catalog/curatedAssets';
import type { CuratedAssetsFormSelectedAssetsInfo } from './CuratedAssetsModal.vue';

/**
 * Advanced filter field — product adaptation of official
 * `AdvancedAssetsFilterField.component.tsx`.
 *
 * Official renders the react-awesome-query-builder tree bound to the
 * AdvanceSearchProvider. This console has no advanced-search query builder
 * (see `catalog/advancedSearch.ts`: the only verified search surface is
 * GET /v1/search/query), so the field edits the same `queryFilter` JSON
 * as text, validated by the same `isValidElasticsearchQuery`, with the
 * same debounced count and Explore link. The builder tree itself is a
 * stage-D residual, recorded in the ADR — the saved value's shape is
 * unchanged, so a builder can take over this field without migrating
 * any saved config.
 *
 * ADR:2026-11-08-my-data-curated-assets
 */
const props = defineProps<{
  queryFilter?: string;
  resources: string[];
  selectedAssetsInfo: CuratedAssetsFormSelectedAssetsInfo;
  fetchEntityCount: (args: {
    countKey: string;
    selectedResource: string[];
    queryFilter?: string;
    shouldUpdateResourceList?: boolean;
  }) => Promise<void>;
}>();

const emit = defineEmits<{
  (event: 'update:query-filter', queryFilter: string): void;
}>();

const { t } = useI18n();

const text = ref(props.queryFilter ?? '');
const isCountLoading = ref(false);
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => props.queryFilter,
  (next) => {
    text.value = next ?? '';
  },
);

const expandedResources = computed(() =>
  props.resources.includes('all')
    ? props.resources
    : props.resources,
);

const queryURL = computed(() => {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text.value || '{}') as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const modified = getModifiedQueryFilterWithSelectedAssets(
    parsed,
    expandedResources.value,
  );
  return { name: 'search', query: { query_filter: JSON.stringify(modified) } };
});

const showFilteredResourceCount = computed(
  () =>
    text.value.trim().length > 0 &&
    props.resources.length > 0 &&
    props.selectedAssetsInfo.filteredResourceCount !== undefined &&
    !isCountLoading.value,
);

async function handleEntityCount(queryFilter: string): Promise<void> {
  try {
    isCountLoading.value = true;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(queryFilter || '{}') as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const modified = getModifiedQueryFilterWithSelectedAssets(
      parsed,
      expandedResources.value,
    );
    await props.fetchEntityCount({
      countKey: 'filteredResourceCount',
      selectedResource: expandedResources.value,
      queryFilter: JSON.stringify(modified),
    });
  } finally {
    isCountLoading.value = false;
  }
}

function onInput(value: string): void {
  text.value = value;
  emit('update:query-filter', value);
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    if (props.resources.length > 0) {
      void handleEntityCount(value);
    }
  }, 500);
}

const isInvalid = computed(
  () => text.value.trim().length > 0 && !isValidElasticsearchQuery(text.value),
);
</script>

<template>
  <div class="advanced-filter">
    <label class="advanced-filter__label" for="curated-advanced-filter">
      {{ t('home.advancedFilter') }}
    </label>
    <Input.TextArea
      id="curated-advanced-filter"
      data-testid="advanced-filter-container"
      :value="text"
      :rows="6"
      :placeholder="t('home.advancedFilterPlaceholder')"
      :status="isInvalid ? 'error' : undefined"
      @update:value="onInput"
    />
    <p v-if="isInvalid" class="advanced-filter__error">
      {{ t('home.advancedFilterInvalid') }}
    </p>
    <Skeleton v-if="isCountLoading" :paragraph="{ rows: 1 }" />
    <p v-if="showFilteredResourceCount" class="advanced-filter__count">
      {{
        t('home.countAssetsMatchFilter', {
          count: selectedAssetsInfo.filteredResourceCount,
        })
      }}
      <router-link :to="queryURL" target="_blank">
        {{ t('home.viewInExplore') }}
      </router-link>
    </p>
  </div>
</template>

<style scoped>
.advanced-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.advanced-filter__label {
  font-size: 13px;
  font-weight: 500;
}

.advanced-filter__error {
  margin: 0;
  font-size: 12px;
  color: var(--sm-color-error);
}

.advanced-filter__count {
  margin: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
}
</style>
