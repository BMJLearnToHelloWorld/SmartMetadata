<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Empty, Pagination, Select, Space, Tag, Typography } from 'ant-design-vue';
import { searchAssets } from '@/api/search';
import {
  EXPLORE_TABS,
  defaultSortForTab,
  exploreSortFromQuery,
  exploreTabFromQuery,
  sortOptionsForTab,
  type ExploreSort,
  type ExploreTab,
} from '@/catalog/exploreTabs';
import {
  browsePathLabels,
  buildEstateTree,
  estateCategory,
  estateFromQuery,
  filtersForEstateNode,
  isResidualEstate,
  selectedEstateFromFilters,
  type EstateNode,
} from '@/catalog/browseEstate';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import { CHIP_FACET_IDS, type FacetBucket, type FacetId, type SearchFacet } from '@/catalog/searchFacets';
import { entityTypeColor, hitLocation } from '@/catalog/searchHits';
import {
  DEFAULT_SORT,
  SEARCH_PAGE_SIZE,
  SORT_OPTIONS,
  composeSearchQuery,
  filtersFromQuery,
  filtersToQuery,
  hasActiveFilters,
  pageFromQuery,
  sortField,
  sortFromQuery,
  type SearchFilters,
} from '@/catalog/searchQuery';
import DetailTabs from '@/components/shared/DetailTabs.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import ExploreEstateTree from '@/features/explore/ExploreEstateTree.vue';
import ExploreFilterChips from '@/features/explore/ExploreFilterChips.vue';
import ExplorePreview from '@/features/explore/ExplorePreview.vue';
import type { SearchHit } from '@/types/api';

const route = useRoute();
const router = useRouter();
const { t, te } = useI18n();

const loading = ref(false);
const errorMessage = ref('');
const hits = ref<SearchHit[]>([]);
const total = ref(0);
const facets = ref<SearchFacet[]>([]);
const estateFacets = ref<SearchFacet[]>([]);
const serviceBuckets = ref<FacetBucket[]>([]);
const expandedKeys = ref<string[]>([]);
const selectedFqn = ref('');

const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''));
const filters = computed(() => filtersFromQuery(route.query));
const page = computed(() => pageFromQuery(route.query.page));
const estateId = computed(() => estateFromQuery(route.query) || selectedEstateFromFilters(filters.value));
const residual = computed(() => isResidualEstate(estateId.value));
const activeTab = computed<ExploreTab | null>(() => exploreTabFromQuery(route.query));
const sortOptions = computed(() =>
  activeTab.value
    ? sortOptionsForTab(activeTab.value)
    : SORT_OPTIONS.map((option) => ({ id: option.id, field: option.field, defaultOrder: option.defaultOrder })),
);
const currentSort = computed<ExploreSort>(() => {
  if (activeTab.value) {
    return exploreSortFromQuery(route.query, activeTab.value);
  }
  const base = sortFromQuery(route.query);
  return { id: base.id, order: base.order, field: sortField(base) };
});
const tabCounts = computed(() => {
  const facet = facets.value.find((item) => item.id === 'entityType');
  const counts = new Map<string, number>();
  for (const bucket of facet?.buckets ?? []) {
    counts.set(bucket.key, bucket.count);
  }
  return counts;
});
const exploreTabItems = computed(() => {
  const items = [
    {
      key: 'all',
      label: total.value ? `${t('explore.all')} (${total.value})` : t('explore.all'),
    },
  ];
  for (const tab of EXPLORE_TABS) {
    // Counts come only from the current search's entityType aggregation;
    // no independent per-tab count request is faked (see residuals).
    const count = tabCounts.value.get(tab.entityType);
    const label = t(`explore.entity.${tab.labelKey}`);
    items.push({ key: tab.index, label: count !== undefined ? `${label} (${count})` : label });
  }
  return items;
});
const searchKey = computed(() =>
  JSON.stringify({
    q: query.value,
    filters: filters.value,
    page: page.value,
    sort: currentSort.value,
    estate: estateFromQuery(route.query),
    tab: activeTab.value?.index ?? 'all',
  }),
);

const estateNodes = computed(() => buildEstateTree(estateFacets.value, estateId.value, serviceBuckets.value));
const selectedEstateKeys = computed(() => {
  const service = filters.value.service?.[0];
  if (estateId.value && service) {
    return [`${estateId.value}:service:${service}`];
  }
  return estateId.value ? [estateId.value] : [];
});
const crumbs = computed(() => browsePathLabels(filters.value, estateId.value));
const selectedHit = computed(
  () => hits.value.find((hit) => (hit.fullyQualifiedName || hit.name) === selectedFqn.value) ?? hits.value[0] ?? null,
);
const recordRange = computed(() => {
  if (!total.value) {
    return { from: 0, to: 0 };
  }
  const from = page.value * SEARCH_PAGE_SIZE + 1;
  return { from, to: Math.min(total.value, from + hits.value.length - 1) };
});

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function facetTitle(id: FacetId): string {
  return t(`explore.facets.${id}`);
}

function crumbLabel(label: string): string {
  return label.startsWith('explore.') ? t(label) : label;
}

function pushSearch(
  nextQuery: string,
  nextFilters: SearchFilters,
  nextPage = 0,
  nextSort: { id: string; order: 'asc' | 'desc' } = currentSort.value,
  nextEstate = estateFromQuery(route.query),
  nextTab: ExploreTab | null = activeTab.value,
): void {
  const next: Record<string, string> = { ...filtersToQuery(nextFilters) };
  const trimmed = nextQuery.trim();
  if (trimmed) {
    next.q = trimmed;
  }
  if (nextPage > 0) {
    next.page = String(nextPage);
  }
  const options = nextTab ? sortOptionsForTab(nextTab) : SORT_OPTIONS;
  const option = options.find((item) => item.id === nextSort.id) ?? options[0];
  const fallback = nextTab ? defaultSortForTab(nextTab) : DEFAULT_SORT;
  if (nextSort.id !== fallback.id) {
    next.sort = nextSort.id;
  }
  if (nextSort.order !== option.defaultOrder) {
    next.sort = nextSort.id;
    next.order = nextSort.order;
  }
  if (nextEstate) {
    next.estate = nextEstate;
  }
  if (nextTab) {
    next.tab = nextTab.index;
  }
  void router.push({ name: 'search', query: next });
}

function onChipChange(id: FacetId, values: string[]): void {
  const next: SearchFilters = { ...filters.value, [id]: values };
  if (!values.length) {
    delete next[id];
  }
  const estate = id === 'entityType' ? selectedEstateFromFilters(next) : estateFromQuery(route.query);
  pushSearch(query.value, next, 0, currentSort.value, estate);
}

function onToggleFacet(id: FacetId, value: string): void {
  const current = filters.value[id] ?? [];
  const nextValues = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  onChipChange(id, nextValues);
}

function onClearFilters(): void {
  pushSearch(query.value, {}, 0, currentSort.value, '');
}

function onPageChange(next: number): void {
  pushSearch(query.value, filters.value, Math.max(0, next - 1));
}

function onSortChange(value: unknown): void {
  const option = sortOptions.value.find((item) => item.id === value) ?? sortOptions.value[0];
  pushSearch(
    query.value,
    filters.value,
    0,
    { id: option.id, order: option.defaultOrder },
    estateFromQuery(route.query),
    activeTab.value,
  );
}

function onToggleSortOrder(): void {
  const flipped = currentSort.value.order === 'asc' ? 'desc' : 'asc';
  pushSearch(
    query.value,
    filters.value,
    0,
    { id: currentSort.value.id, order: flipped },
    estateFromQuery(route.query),
    activeTab.value,
  );
}

function onTabChange(key: string): void {
  const tab = key === 'all' ? null : (EXPLORE_TABS.find((item) => item.index === key) ?? null);
  const options = tab ? sortOptionsForTab(tab) : SORT_OPTIONS;
  const fallback = tab ? defaultSortForTab(tab) : { id: DEFAULT_SORT.id, defaultOrder: DEFAULT_SORT.order };
  const sort = options.some((item) => item.id === currentSort.value.id)
    ? { id: currentSort.value.id, order: currentSort.value.order }
    : { id: fallback.id, order: fallback.defaultOrder };
  pushSearch(query.value, filters.value, 0, sort, estateFromQuery(route.query), tab);
}

function onEstateSelect(node: EstateNode): void {
  if (isResidualEstate(node.categoryId)) {
    pushSearch(query.value, { ...filters.value, entityType: undefined, service: undefined }, 0, currentSort.value, node.categoryId);
    return;
  }
  pushSearch(query.value, filtersForEstateNode(node, filters.value), 0, currentSort.value, node.categoryId);
}

function onEstateExpand(keys: string[]): void {
  expandedKeys.value = keys;
}

function selectHit(hit: SearchHit): void {
  selectedFqn.value = hit.fullyQualifiedName || hit.name;
}

function openHit(hit: SearchHit): void {
  if (!hit.fullyQualifiedName || !hit.entityType || !isDetailWired(hit.entityType)) {
    selectHit(hit);
    return;
  }
  void router.push(assetLocation(hit.entityType, hit.fullyQualifiedName));
}

function hitKey(hit: SearchHit, index: number): string {
  return hit.fullyQualifiedName || hit.id || `${hit.entityType}-${index}`;
}

function isSelected(hit: SearchHit): boolean {
  const key = hit.fullyQualifiedName || hit.name;
  return selectedHit.value ? (selectedHit.value.fullyQualifiedName || selectedHit.value.name) === key : false;
}

function openResidual(): void {
  const routeName = estateNodes.value.find((node) => node.key === estateId.value)?.residualRoute;
  if (routeName) {
    void router.push({ name: routeName });
  }
}

async function loadEstatePresence(): Promise<void> {
  try {
    const pageResult = await searchAssets(query.value.trim() || '*', 0, 0);
    estateFacets.value = pageResult.facets;
  } catch {
    estateFacets.value = [];
  }
}

async function loadEstateServices(categoryId: string): Promise<void> {
  const category = estateCategory(categoryId);
  if (!category?.expandable || !category.entityTypes.length) {
    serviceBuckets.value = [];
    return;
  }
  try {
    const pageResult = await searchAssets(composeSearchQuery(query.value, { entityType: category.entityTypes }), 0, 0);
    serviceBuckets.value = pageResult.facets.find((facet) => facet.id === 'service')?.buckets ?? [];
  } catch {
    serviceBuckets.value = [];
  }
}

async function runSearch(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const estatePromise = loadEstatePresence();
    if (residual.value) {
      hits.value = [];
      total.value = 0;
      facets.value = [];
      serviceBuckets.value = [];
      await estatePromise;
      return;
    }
    const pageResult = await searchAssets(composeSearchQuery(query.value, filters.value), page.value * SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE, {
      index: activeTab.value?.index ?? 'dataAsset',
      sortField: currentSort.value.field,
      sortOrder: currentSort.value.order,
    });
    hits.value = pageResult.hits;
    total.value = pageResult.total;
    facets.value = pageResult.facets;
    if (estateId.value) {
      expandedKeys.value = [estateId.value];
      await Promise.all([estatePromise, loadEstateServices(estateId.value)]);
    } else {
      serviceBuckets.value = [];
      await estatePromise;
    }
    if (hits.value.length && !hits.value.some((hit) => (hit.fullyQualifiedName || hit.name) === selectedFqn.value)) {
      selectedFqn.value = hits.value[0].fullyQualifiedName || hits.value[0].name;
    }
  } catch (error) {
    hits.value = [];
    total.value = 0;
    facets.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('explore.failed');
  } finally {
    loading.value = false;
  }
}

watch(
  searchKey,
  () => {
    void runSearch();
  },
  { immediate: true },
);

watch(expandedKeys, (keys) => {
  const categoryId = keys.find((key) => !key.includes(':service:'));
  if (categoryId && categoryId === estateId.value && !serviceBuckets.value.length) {
    void loadEstateServices(categoryId);
  }
});
</script>

<template>
  <div class="explore">
    <PageHeader :header="t('explore.title')" :sub-header="query ? t('explore.leadQuery', { query }) : t('explore.lead')" />
    <DetailTabs
      :tabs="exploreTabItems"
      :active-key="activeTab?.index ?? 'all'"
      test-id="explore-tabs"
      @change="onTabChange"
    />
    <div class="explore__toolbar">
      <ExploreFilterChips :facets="facets.length ? facets : estateFacets" :filters="filters" @change="onChipChange" />
      <div class="explore__toolbar-end">
        <Select
          data-testid="explore-sort"
          class="explore__sort"
          size="small"
          :value="currentSort.id"
          :aria-label="t('explore.sort')"
          @change="onSortChange"
        >
          <Select.Option v-for="option in sortOptions" :key="option.id" :value="option.id">
            {{ t(`explore.sort${option.id.charAt(0).toUpperCase()}${option.id.slice(1)}`) }}
          </Select.Option>
        </Select>
        <Button
          data-testid="explore-sort-order"
          size="small"
          :aria-label="t('explore.sort')"
          @click="onToggleSortOrder"
        >
          {{ currentSort.order === 'asc' ? t('explore.sortAsc') : t('explore.sortDesc') }}
        </Button>
        <Button
          v-if="hasActiveFilters(filters) || estateFromQuery(route.query)"
          type="link"
          size="small"
          data-testid="search-clear-filters"
          :aria-label="t('explore.clearFiltersHelp')"
          @click="onClearFilters"
        >
          {{ t('explore.clearFilters') }}
        </Button>
      </div>
    </div>
    <Space v-if="hasActiveFilters(filters)" wrap class="explore__active">
      <template v-for="id in CHIP_FACET_IDS" :key="id">
        <Tag
          v-for="value in filters[id] ?? []"
          :key="`${id}:${value}`"
          closable
          :data-testid="`search-active-${id}-${value}`"
          @close="onToggleFacet(id, value)"
        >
          {{ facetTitle(id) }}: {{ id === 'entityType' ? entityLabel(value) : value }}
        </Tag>
      </template>
    </Space>
    <div class="explore__split">
      <aside class="explore__pane explore__pane--estate">
        <ExploreEstateTree
          :nodes="estateNodes"
          :selected-keys="selectedEstateKeys"
          :expanded-keys="expandedKeys"
          @select="onEstateSelect"
          @expand="onEstateExpand"
        />
      </aside>
      <section class="explore__pane explore__pane--results">
        <nav v-if="crumbs.length" class="explore__crumbs" data-testid="explore-browse-path">
          <span v-for="(crumb, index) in crumbs" :key="crumb.key">
            <span v-if="index"> / </span>
            {{ crumbLabel(crumb.label) }}
          </span>
        </nav>
        <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="explore__error" />
        <div data-testid="search-results" class="explore__results">
          <Empty
            v-if="!loading && residual && !errorMessage"
            data-testid="explore-residual-empty"
            :description="estateId === 'contextCenter' ? t('explore.residualContext') : t('explore.residualDomains')"
          >
            <Button type="primary" data-testid="explore-residual-cta" @click="openResidual">
              {{ estateId === 'contextCenter' ? t('explore.openContextCenter') : t('explore.openDomains') }}
            </Button>
          </Empty>
          <Empty
            v-else-if="!loading && !hits.length && !errorMessage"
            data-testid="explore-empty"
            :description="t('explore.emptyTitle')"
          >
            <template #description>
              <Typography.Title :level="5">{{ t('explore.emptyTitle') }}</Typography.Title>
              <Typography.Paragraph type="secondary">{{ t('explore.emptyHint') }}</Typography.Paragraph>
            </template>
            <Space>
              <Button v-if="hasActiveFilters(filters)" data-testid="explore-empty-clear" @click="onClearFilters">
                {{ t('explore.clearFilters') }}
              </Button>
              <Button type="primary" data-testid="explore-empty-cta" @click="onClearFilters">
                {{ t('explore.exploreAll') }}
              </Button>
            </Space>
          </Empty>
          <article
            v-for="(hit, index) in hits"
            :key="hitKey(hit, index)"
            class="explore__card explore__card--dense explore__card--om"
            :class="{ 'explore__card--selected': isSelected(hit) }"
            :data-testid="`search-card-${hit.fullyQualifiedName || hit.name}`"
            @click="selectHit(hit)"
          >
            <div class="explore__card-head">
              <Tag :color="entityTypeColor(hit.entityType)">{{ entityLabel(hit.entityType) }}</Tag>
              <a href="#" class="explore__card-name" @click.prevent.stop="openHit(hit)">
                {{ hit.displayName || hit.name }}
              </a>
              <Typography.Text v-if="!isDetailWired(hit.entityType)" type="secondary">
                {{ t('explore.unwired') }}
              </Typography.Text>
            </div>
            <Typography.Paragraph v-if="hit.fullyQualifiedName" class="explore__fqn" type="secondary">
              {{ hit.fullyQualifiedName }}
            </Typography.Paragraph>
            <Typography.Paragraph
              class="explore__desc"
              :ellipsis="{ rows: 2 }"
              :content="hit.description || t('explore.noDescription')"
            />
            <div class="explore__meta">
              <Typography.Text type="secondary">
                {{ hitLocation(hit) || t('explore.locationMissing') }}
              </Typography.Text>
              <Typography.Text v-if="hit.serviceType" type="secondary">{{ hit.serviceType }}</Typography.Text>
              <Typography.Text v-if="hit.tier" type="secondary">{{ hit.tier }}</Typography.Text>
            </div>
            <Space wrap>
              <Typography.Text v-if="!hit.owners.length" type="secondary">{{ t('explore.noOwners') }}</Typography.Text>
              <span v-for="owner in hit.owners" :key="owner.name">{{ owner.displayName || owner.name }}</span>
              <Tag v-for="tag in hit.tags" :key="tag.tagFQN">{{ tag.name }}</Tag>
            </Space>
          </article>
        </div>
        <div v-if="!loading && !errorMessage && !residual" class="explore__footer">
          <Typography.Text type="secondary">
            {{
              total
                ? t('explore.records', { from: recordRange.from, to: recordRange.to, total })
                : t('explore.shown', { shown: hits.length })
            }}
          </Typography.Text>
          <Pagination
            v-if="total > SEARCH_PAGE_SIZE"
            data-testid="search-pagination"
            size="small"
            :current="page + 1"
            :page-size="SEARCH_PAGE_SIZE"
            :total="total"
            :show-size-changer="false"
            @change="onPageChange"
          />
        </div>
      </section>
      <aside class="explore__pane explore__pane--preview">
        <ExplorePreview :hit="residual ? null : selectedHit" @open="openHit" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.explore {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: calc(100vh - 120px);
}
.explore__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.explore__toolbar-end {
  display: flex;
  align-items: center;
  gap: 8px;
}
.explore__sort {
  min-width: 140px;
}
.explore__active {
  margin-bottom: 0;
}
.explore__split {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(240px, 300px);
  gap: 12px;
  align-items: stretch;
  min-height: 520px;
}
.explore__pane {
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius, 6px);
  background: var(--sm-bg-container, #fff);
  padding: 12px;
  min-width: 0;
}
.explore__pane--results {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.explore__crumbs {
  font-size: 12px;
  color: var(--sm-text-tertiary, #535862);
  margin-bottom: 8px;
}
.explore__error {
  margin-bottom: 12px;
}
.explore__results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.explore__card {
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius, 6px);
  padding: 8px 12px;
  background: var(--sm-bg-container, #fff);
  cursor: pointer;
}
.explore__card--dense {
  box-shadow: none;
}
.explore__card--dense:hover,
.explore__card--selected {
  border-color: var(--sm-color-primary, #1570ef);
  background: var(--sm-color-primary-bg, #eff8ff);
  box-shadow: inset 3px 0 0 var(--sm-color-primary, #1570ef);
}
.explore__card--dense:hover .explore__card-name,
.explore__card--selected .explore__card-name {
  color: var(--sm-color-primary, #1570ef);
}
.explore__card-head {
  display: flex;
  align-items: center;
  gap: 6px 8px;
  flex-wrap: wrap;
  min-height: 24px;
}
.explore__card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-text-primary, #181d27);
  line-height: 1.3;
}
.explore__fqn,
.explore__desc {
  margin-bottom: 2px;
}
.explore__fqn {
  font-size: 12px;
  line-height: 1.4;
}
.explore__desc {
  font-size: 14px;
  color: var(--sm-text-secondary);
}
.explore__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 2px;
  font-size: 12px;
  color: var(--sm-text-tertiary, #535862);
}
.explore__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}
@media (max-width: 1100px) {
  .explore__split {
    grid-template-columns: 1fr;
  }
}
</style>
