<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Select } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import { permissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import type { OverviewFilter, OverviewOrder } from '@/catalog/domainOverview';
import { useDataProducts, type DataProductSummary } from './useDataProducts';

const props = defineProps<{ widgetKey: string }>();

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();

const filter = ref<OverviewFilter>('all');
const sort = ref<string>('mostAssets');

const order = computed<OverviewOrder>(() =>
  sort.value === 'recentlyUpdated' ? 'recentlyUpdated' : 'name',
);

const {
  products,
  totalCount,
  unownedCount,
  emptyCount,
  domainCount,
  isError,
  isLoading,
  refetch,
} = useDataProducts(
  computed(() => filter.value),
  order,
);

const canCreate = ref(false);
void (async () => {
  try {
    canCreate.value = permissionFlags(
      await permissionStore.getResourcePermission('dataProduct'),
    ).canCreate;
  } catch {
    canCreate.value = false;
  }
})();

const sortOptions = computed(() => [
  { label: t('home.mostAssets'), value: 'mostAssets' },
  { label: t('home.recentlyUpdated'), value: 'recentlyUpdated' },
  { label: t('home.needsAttention'), value: 'needsAttention' },
  { label: t('home.aToZ'), value: 'alphabetical' },
]);

/**
 * How badly a product wants looking at: an unowned product and an empty one are
 * each one problem, and a product that is both outranks either.
 */
function attentionScore(product: DataProductSummary): number {
  return (product.owners.length > 0 ? 0 : 1) + (product.assetCount === 0 ? 1 : 0);
}

const BY_SORT: Record<string, (a: DataProductSummary, b: DataProductSummary) => number> = {
  mostAssets: (a, b) => b.assetCount - a.assetCount,
  recentlyUpdated: (a, b) => b.updatedAt - a.updatedAt,
  // Alphabetical second, so an unowned-and-empty block keeps a stable reading order.
  needsAttention: (a, b) => attentionScore(b) - attentionScore(a) || a.name.localeCompare(b.name),
  alphabetical: (a, b) => a.name.localeCompare(b.name),
};

// A copy, so sorting in place never reorders the hook's own result.
const visibleProducts = computed(() =>
  [...products.value].sort(BY_SORT[sort.value] ?? BY_SORT.mostAssets),
);

const bucketSize = computed<Record<OverviewFilter, number>>(() => ({
  all: totalCount.value,
  noOwner: unownedCount.value,
  empty: emptyCount.value,
}));
const remaining = computed(() => Math.max(0, bucketSize.value[filter.value] - products.value.length));

const emptyState = computed(() =>
  totalCount.value === 0
    ? {
        title: t('home.noDataProductsYet'),
        description: t('home.dataProductsEmptyDescription'),
        summary: t('home.dataProductsWidgetDescription'),
        actionLabel: canCreate.value ? t('home.newDataProduct') : undefined,
      }
    : undefined,
);

const status = computed(() =>
  unownedCount.value > 0
    ? { label: t('home.countUnowned', { count: unownedCount.value }), tone: 'warning' as const }
    : undefined,
);

const chips = computed(() => [
  { id: 'all' as OverviewFilter, label: t('home.all'), count: totalCount.value },
  { id: 'noOwner' as OverviewFilter, label: t('home.noOwner'), count: unownedCount.value },
  { id: 'empty' as OverviewFilter, label: t('home.empty'), count: emptyCount.value },
]);

function ownerNames(owners: { displayName?: string; name: string }[]): string {
  return owners.length
    ? owners.map((owner) => owner.displayName || owner.name).join(', ')
    : t('home.noOwner');
}

function openDataProducts(): void {
  void router.push({ name: 'governance-data-products' });
}

function openProduct(id: string): void {
  void router.push({ name: 'governance-data-product', params: { id } });
}
</script>

<template>
  <HomeWidgetCard
    :title="t('home.dataProducts')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="status"
    :summary="t('home.countDataProductsCountDomains', { count: totalCount, domains: domainCount })"
    :meta="remaining > 0 ? t('home.countMoreDataProducts', { count: remaining }) : undefined"
    :empty-state="emptyState"
    @retry="refetch"
    @empty-action="openDataProducts"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="openDataProducts">
        {{ t('home.viewAllDataProducts') }}
      </button>
    </template>
    <div v-if="!emptyState" class="overview-widget__body">
      <div class="overview-widget__chips" role="group" :aria-label="t('home.dataProducts')">
        <button
          v-for="chip in chips"
          :key="chip.id"
          type="button"
          class="overview-widget__chip"
          :class="{ 'overview-widget__chip--active': filter === chip.id }"
          :aria-pressed="filter === chip.id"
          :data-testid="`data-products-chip-${chip.id}`"
          @click="filter = chip.id"
        >
          {{ chip.label }} · {{ chip.count }}
        </button>
        <Select
          data-testid="data-product-sort-filter"
          :value="sort"
          :options="sortOptions"
          size="small"
          @change="(value) => (sort = String(value))"
        />
      </div>
      <ul class="overview-widget__rows" data-testid="data-product-rows">
        <li
          v-for="product in visibleProducts"
          :key="product.id"
          class="overview-widget__row"
          :data-testid="`data-product-card-${product.id}`"
        >
          <span class="overview-widget__tile" aria-hidden="true">📦</span>
          <div class="overview-widget__main">
            <button
              type="button"
              class="overview-widget__name"
              data-testid="data-product-name"
              @click="openProduct(product.id)"
            >
              {{ product.name }}
            </button>
            <span class="overview-widget__meta">
              <span v-if="product.domainName">{{ product.domainName }} · </span>{{ ownerNames(product.owners) }}
            </span>
          </div>
          <span class="overview-widget__count">
            {{ t('home.countAssets', { count: product.assetCount }) }}
          </span>
        </li>
      </ul>
    </div>
  </HomeWidgetCard>
</template>

<style scoped>
.overview-widget__body {
  display: flex;
  flex-direction: column;
}

.overview-widget__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.overview-widget__chip {
  border: 1px solid #d9d9d9;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  padding: 4px 12px;
  font-size: 12px;
}

.overview-widget__chip--active {
  border-color: #005587;
  color: #005587;
  font-weight: 600;
}

.overview-widget__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.overview-widget__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.overview-widget__row:last-child {
  border-bottom: 0;
}

.overview-widget__tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #e6f0f6;
  font-size: 16px;
}

.overview-widget__main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.overview-widget__name {
  border: 0;
  background: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: #005587;
}

.overview-widget__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.overview-widget__count {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
}
</style>
