<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Empty, Select } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import { serviceTypeIcon } from '../serviceTypeIcon';
import type { CountSort } from '../homeQueries';
import type { FacetBucket } from '@/catalog/searchFacets';

/**
 * `KnowledgePanel.DataEstate` — rendered with the existing Data Assets
 * card's capability only (service tiles + counts from the search
 * facets). No window trend, no description coverage, no connector
 * detail: those dimensions are stage-B residuals (REVIEW-W1-5-G11
 * §2-12 row 2), and this widget must not be read as the official
 * DataEstate component.
 */
const props = defineProps<{
  services: FacetBucket[];
  sort: CountSort;
  sortOptions: Array<{ value: CountSort; label: string }>;
}>();

const emit = defineEmits<{
  'change-sort': [value: CountSort];
  'select-service-type': [serviceType: string];
}>();

const { t, locale } = useI18n();

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value).format(value);
}

function onSort(value: unknown): void {
  if (value === 'high' || value === 'low') {
    emit('change-sort', value);
  }
}
</script>

<template>
  <HomeWidgetCard :title="t('home.dataAssets')" test-id="home-widget-data-estate">
    <template #extra>
      <Select
        data-testid="home-data-assets-sort"
        size="small"
        :value="sort"
        :options="sortOptions"
        :bordered="false"
        @change="onSort"
      />
    </template>
    <div v-if="services.length" class="home-services" data-testid="home-data-assets-grid">
      <button
        v-for="bucket in services"
        :key="bucket.key"
        type="button"
        class="home-services__tile"
        :data-testid="`home-service-${bucket.key}`"
        @click="emit('select-service-type', bucket.key)"
      >
        <component :is="serviceTypeIcon(bucket.key)" class="home-services__icon" />
        <span class="home-services__name">{{ bucket.key }}</span>
        <span class="home-services__count">{{ formatCount(bucket.count) }}</span>
      </button>
    </div>
    <Empty v-else data-testid="home-data-assets-empty" :description="t('home.dataAssetsEmpty')" />
  </HomeWidgetCard>
</template>

<style scoped>
.home-services {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 16px 8px;
}
.home-services__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--sm-text-primary);
}
.home-services__icon {
  font-size: 28px;
  color: var(--sm-text-secondary);
}
.home-services__name {
  font-size: 12px;
  text-align: center;
  color: var(--sm-text-secondary);
}
.home-services__count {
  min-width: 28px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--sm-count-pill-bg);
  color: var(--sm-count-pill-text);
  font-size: 12px;
  font-weight: 600;
}
</style>
