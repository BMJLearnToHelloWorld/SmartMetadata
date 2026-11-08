<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Spin } from 'ant-design-vue';
import { listActivityEvents } from '@/api/activity';
import { listSystemChartData } from '@/api/dataInsights';
import { listDomains } from '@/api/domains';
import { listKpis } from '@/api/kpi';
import { searchAssets } from '@/api/search';
import { assetLocation } from '@/catalog/entityRoutes';
import { searchRouteQuery, type SearchFilters } from '@/catalog/searchQuery';
import HomeHero from '@/features/home/HomeHero.vue';
import { insightResultsToSeries } from '@/features/charts/series';
import { seriesWindow } from '@/features/charts/types';
import {
  EXCLUDED_WIDGET_FQNS,
  LANDING_PAGE_MAX_GRID_SIZE,
  LANDING_PAGE_WIDGET_HEIGHT_PX,
  LANDING_PAGE_WIDGET_KEYS,
  MY_DATA_WIDGET_KEYS,
  DEFAULT_LANDING_PAGE_LAYOUT,
  extractSavedLandingLayout,
  normalizeLandingPageLayout,
} from '@/features/home/landingPageLayout';
import {
  MY_DATA_WIDGET_PLACEHOLDER_META,
  myDataWidgetSlug,
  resolveMyDataWidget,
  resolveMyDataWidgetBaseKey,
} from '@/features/home/landingPageWidgets';
import {
  domainFilters,
  followedAssetsQuery,
  ownedAssetsQuery,
  scopedSearchQuery,
  sortCountBuckets,
  type ActivityFilter,
  type AssetSort,
  type CountSort,
  type TotalRangeDays,
} from '@/features/home/homeQueries';
import { useAuthStore } from '@/stores/auth';
import { usePersonaStore } from '@/stores/persona';
import type { ActivityEvent } from '@/types/collaboration';
import type { FacetBucket } from '@/catalog/searchFacets';
import type { SearchHit } from '@/types/api';
import type { Kpi } from '@/types/kpi';
import type { Domain } from '@/types/governance';

/**
 * The landing page, stage A (REVIEW-W1-5-G11): the official 13-item
 * grid over the persona document's saved layout, normalized by
 * `normalizeLandingPageLayout`, rendered through the widget registry.
 * Five cells carry existing product capability; eight are honest
 * empty placeholders until stage B builds their components.
 *
 * ADR:2026-11-07-my-data-layout-normalization-five-params
 * ADR:2026-11-07-my-data-row-height-non-subdivided
 * ADR:2026-11-07-my-data-right-rail-keeps-home-hero
 *
 * No customize entry lives here (B-1 is stage D), no greeting header
 * is built (the single welcome copy is HomeHero, in the right rail),
 * and no per-user layout is read or written (B-6: per-persona only).
 */
const router = useRouter();
const auth = useAuthStore();
const persona = usePersonaStore();
const { t, locale } = useI18n();

const loading = ref(false);
const selectedDomain = ref('');
const activityFilter = ref<ActivityFilter>('all');
const dataAssetSort = ref<CountSort>('high');
const trackedSort = ref<AssetSort>('latest');
const totalRange = ref<TotalRangeDays>(7);

const activity = ref<ActivityEvent[]>([]);
const serviceBuckets = ref<FacetBucket[]>([]);
const serviceChips = ref<FacetBucket[]>([]);
const entityBuckets = ref<FacetBucket[]>([]);
const catalogTotal = ref(0);
const owned = ref<SearchHit[]>([]);
const followed = ref<SearchHit[]>([]);
const ownedTotal = ref(0);
const followedTotal = ref(0);
const kpis = ref<Kpi[]>([]);
const domains = ref<Domain[]>([]);
const domainsUnavailable = ref(false);
const totalSeries = ref<ReturnType<typeof insightResultsToSeries>>([]);
const kpiTried = ref(false);

/**
 * The layout gate (condition 3): until the persona document has been
 * read and the auth user is resolved, only the skeleton renders — no
 * default grid, no widget queries. Officially this avoids mounting
 * the whole grid only to tear it down once the saved layout arrives.
 */
const layoutReady = computed(() => persona.documentLoaded && auth.user !== null);

/** The normalized layout: saved persona layout, or the 13-item default. */
const layout = computed(() =>
  normalizeLandingPageLayout(
    extractSavedLandingLayout(persona.document),
    DEFAULT_LANDING_PAGE_LAYOUT,
    EXCLUDED_WIDGET_FQNS,
    LANDING_PAGE_MAX_GRID_SIZE,
    MY_DATA_WIDGET_KEYS,
  ),
);

/** Cells the registry can actually render; an unknown key renders nothing and leaves no empty cell. */
const renderableLayout = computed(() =>
  layout.value.filter((item) => resolveMyDataWidget(item.i) !== null),
);

const userName = computed(() => auth.displayName || auth.user?.name || '');
const domainOptions = computed(() =>
  domains.value.map((domain) => ({
    value: domain.displayName || domain.name,
    label: domain.displayName || domain.name,
  })),
);
const sortedServices = computed(() => sortCountBuckets(serviceBuckets.value, dataAssetSort.value));
const countSortOptions = computed(() => [
  { value: 'high', label: t('home.sortHighLow') },
  { value: 'low', label: t('home.sortLowHigh') },
]);
const assetSortOptions = computed(() => [
  { value: 'latest', label: t('home.sortLatest') },
  { value: 'name', label: t('home.sortName') },
]);
const rangeOptions = computed(() => [
  { value: 7, label: t('home.last7Days') },
  { value: 30, label: t('home.last30Days') },
]);
const donutSeries = computed(() =>
  entityBuckets.value.length
    ? [{ name: t('home.totalAssets'), points: entityBuckets.value.map((bucket) => ({ label: bucket.key, value: bucket.count })) }]
    : catalogTotal.value
      ? [{ name: t('home.totalAssets'), points: [{ label: t('home.totalAssets'), value: catalogTotal.value }] }]
      : [],
);
function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value).format(value);
}

const formattedTotal = computed(() => formatCount(catalogTotal.value));
const totalAxisLabels = computed(() => {
  const labels = totalSeries.value.flatMap((series) => series.points.map((point) => point.label));
  return [...new Set(labels)];
});

function exploreFilters(extra: SearchFilters = {}): SearchFilters {
  return { ...domainFilters(selectedDomain.value), ...extra };
}

function goExplore(query = '', extra: SearchFilters = {}): void {
  void router.push({ name: 'search', query: searchRouteQuery(query, exploreFilters(extra)) });
}

function onHeroSearch(query: string): void {
  goExplore(query);
}

function onSelectServiceName(name: string): void {
  goExplore('', { service: [name] });
}

function onSelectServiceType(serviceType: string): void {
  goExplore('', { serviceType: [serviceType] });
}

function openHit(hit: SearchHit): void {
  if (!hit.fullyQualifiedName || !hit.entityType) {
    return;
  }
  void router.push(assetLocation(hit.entityType, hit.fullyQualifiedName));
}

function openOwnedMore(): void {
  const query = ownedAssetsQuery(auth.user);
  goExplore(query || '');
}

function openFollowedMore(): void {
  const query = followedAssetsQuery(auth.user);
  goExplore(query || '');
}

function openKpiSetup(): void {
  void router.push({ name: 'insights', query: { tab: 'kpis' } });
}

function openActivity(event: ActivityEvent): void {
  const type = event.entity?.type;
  const fqn = event.entity?.fullyQualifiedName;
  if (type && fqn) {
    void router.push(assetLocation(type, fqn));
  }
}

function onActivityFilter(value: unknown): void {
  activityFilter.value = typeof value === 'string' ? value : 'all';
}

function onDataAssetSort(value: unknown): void {
  if (value === 'high' || value === 'low') {
    dataAssetSort.value = value;
  }
}

function onTrackedSort(value: unknown): void {
  if (value === 'latest' || value === 'name') {
    trackedSort.value = value;
  }
}

function onTotalRange(value: unknown): void {
  if (value === 7 || value === 30) {
    totalRange.value = value;
  }
}

async function loadCharts(days: TotalRangeDays): Promise<void> {
  const window = seriesWindow(days);
  try {
    const data = await listSystemChartData(['total_data_assets'], window.startTs, window.endTs);
    totalSeries.value = insightResultsToSeries('total_data_assets', data.total_data_assets ?? []);
  } catch {
    totalSeries.value = [];
  }
}

async function loadLanding(): Promise<void> {
  loading.value = true;
  kpiTried.value = false;
  const user = auth.user;
  const ownedQuery = ownedAssetsQuery(user);
  const followedQuery = followedAssetsQuery(user);
  const estateQuery = scopedSearchQuery('*', selectedDomain.value);
  try {
    const [activityPage, estate, ownedPage, followedPage, kpiPage] = await Promise.all([
      listActivityEvents({ days: 7, limit: 20 }).catch(() => ({ data: [] as ActivityEvent[] })),
      searchAssets(estateQuery, 0, 1).catch(() => ({ total: 0, hits: [], facets: [] })),
      ownedQuery
        ? searchAssets(scopedSearchQuery(ownedQuery, selectedDomain.value), 0, 15).catch(() => ({
            total: 0,
            hits: [],
            facets: [],
          }))
        : Promise.resolve({ total: 0, hits: [], facets: [] }),
      followedQuery
        ? searchAssets(scopedSearchQuery(followedQuery, selectedDomain.value), 0, 15).catch(() => ({
            total: 0,
            hits: [],
            facets: [],
          }))
        : Promise.resolve({ total: 0, hits: [], facets: [] }),
      listKpis({ limit: 20 }).catch(() => ({ data: [] as Kpi[] })),
    ]);
    activity.value = activityPage.data;
    catalogTotal.value = estate.total;
    serviceBuckets.value = estate.facets.find((facet) => facet.id === 'serviceType')?.buckets ?? [];
    serviceChips.value = (estate.facets.find((facet) => facet.id === 'service')?.buckets ?? []).slice(0, 6);
    entityBuckets.value = estate.facets.find((facet) => facet.id === 'entityType')?.buckets ?? [];
    owned.value = ownedPage.hits;
    ownedTotal.value = ownedPage.total;
    followed.value = followedPage.hits;
    followedTotal.value = followedPage.total;
    kpis.value = kpiPage.data;
  } finally {
    kpiTried.value = true;
    loading.value = false;
  }
}

async function loadDomains(): Promise<void> {
  try {
    const page = await listDomains({ limit: 50 });
    domains.value = page.data;
    domainsUnavailable.value = page.data.length === 0;
  } catch {
    domains.value = [];
    domainsUnavailable.value = true;
  }
}

onMounted(async () => {
  if (auth.isAuthenticated) {
    await auth.refreshUser().catch(() => undefined);
  }
  await persona.ensureLoaded();
  await persona.loadDocument();
  if (!layoutReady.value) {
    return;
  }
  void loadDomains();
  void loadLanding();
  void loadCharts(totalRange.value);
});

watch(selectedDomain, () => {
  if (layoutReady.value) {
    void loadLanding();
  }
});

watch(totalRange, (days) => {
  void loadCharts(days);
});

/** Props for the widget in a grid cell, by registry base key. */
function widgetProps(baseKey: string): Record<string, unknown> {
  switch (baseKey) {
    case LANDING_PAGE_WIDGET_KEYS.ACTIVITY_FEED:
      return { events: activity.value, filter: activityFilter.value };
    case LANDING_PAGE_WIDGET_KEYS.DATA_ESTATE:
      return { services: sortedServices.value, sort: dataAssetSort.value, sortOptions: countSortOptions.value };
    case LANDING_PAGE_WIDGET_KEYS.TOTAL_DATA_ASSETS:
      return {
        total: formattedTotal.value,
        series: donutSeries.value,
        axisLabels: totalAxisLabels.value,
        range: totalRange.value,
        rangeOptions: rangeOptions.value,
      };
    case LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED:
      return {
        owned: owned.value,
        followed: followed.value,
        ownedTotal: ownedTotal.value,
        followedTotal: followedTotal.value,
        sort: trackedSort.value,
        sortOptions: assetSortOptions.value,
      };
    case LANDING_PAGE_WIDGET_KEYS.KPI:
      return { kpis: kpis.value, tried: kpiTried.value };
    default: {
      const meta = MY_DATA_WIDGET_PLACEHOLDER_META[baseKey];
      return { title: meta ? t(meta.titleKey) : baseKey, slug: myDataWidgetSlug(baseKey) };
    }
  }
}

type WidgetListener = (payload?: unknown) => void;

/** Event listeners for the widget in a grid cell, by registry base key. */
function widgetListeners(baseKey: string): Record<string, WidgetListener> {
  switch (baseKey) {
    case LANDING_PAGE_WIDGET_KEYS.ACTIVITY_FEED:
      return {
        'change-filter': (value) => onActivityFilter(value),
        'open-activity': (value) => openActivity(value as ActivityEvent),
        explore: () => goExplore(),
      };
    case LANDING_PAGE_WIDGET_KEYS.DATA_ESTATE:
      return {
        'change-sort': (value) => onDataAssetSort(value),
        'select-service-type': (value) => onSelectServiceType(String(value)),
      };
    case LANDING_PAGE_WIDGET_KEYS.TOTAL_DATA_ASSETS:
      return { 'change-range': (value) => onTotalRange(value) };
    case LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED:
      return {
        'change-sort': (value) => onTrackedSort(value),
        'open-hit': (value) => openHit(value as SearchHit),
        'open-owned-more': () => openOwnedMore(),
        'open-followed-more': () => openFollowedMore(),
        explore: () => goExplore(),
      };
    case LANDING_PAGE_WIDGET_KEYS.KPI:
      return { 'setup-kpi': () => openKpiSetup() };
    default:
      return {};
  }
}

function cellStyle(item: { x: number; y: number }): Record<string, string> {
  return { gridColumn: String(item.x + 1), gridRow: String(item.y + 1) };
}
</script>

<template>
  <!-- P2 B5 tour: no topics section exists on this page, so the tour
       step falls back to the page content per TOUR_PAGE_SELECTOR. -->
  <div class="my-data" data-testid="my-data-page" data-tour-page>
    <div v-if="!layoutReady" class="my-data__skeleton" data-testid="home-landing-skeleton">
      <div class="my-data__skeleton-bar" />
      <div class="my-data__skeleton-bar" />
      <div class="my-data__skeleton-bar" />
    </div>
    <Spin v-else :spinning="loading">
      <div class="my-data__scroll">
        <div class="my-data__grid">
          <div
            class="my-data__widgets"
            data-testid="home-landing-grid"
            :style="{ gridAutoRows: `${LANDING_PAGE_WIDGET_HEIGHT_PX}px` }"
          >
            <div
              v-for="item in renderableLayout"
              :key="`${item.i}-${item.x}-${item.y}`"
              class="my-data__cell"
              data-testid="home-widget-cell"
              :style="cellStyle(item)"
            >
              <component
                :is="resolveMyDataWidget(item.i)"
                v-bind="widgetProps(resolveMyDataWidgetBaseKey(item.i))"
                v-on="widgetListeners(resolveMyDataWidgetBaseKey(item.i))"
              />
            </div>
          </div>
          <div class="my-data__rail">
            <HomeHero
              class="home-area home-area--welcome"
              :user-name="userName"
              :domains="domainOptions"
              :selected-domain="selectedDomain"
              :service-chips="serviceChips"
              :domains-unavailable="domainsUnavailable"
              @search="onHeroSearch"
              @update:selected-domain="selectedDomain = $event"
              @select-service="onSelectServiceName"
            />
          </div>
        </div>
      </div>
    </Spin>
  </div>
</template>

<style scoped>
.my-data {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: calc(100vh - 64px);
  overflow: hidden;
  background: var(--sm-home-canvas);
}
.my-data :deep(.ant-spin-nested-loading),
.my-data :deep(.ant-spin-container) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.my-data__skeleton {
  flex: 1;
  min-height: 0;
  margin: 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.my-data__skeleton-bar {
  height: 132px;
  border-radius: var(--sm-radius-card);
  background: var(--sm-bg-elevated);
}
.my-data__scroll {
  flex: 1;
  min-height: 0;
  margin: 14px;
  overflow-y: auto;
  overflow-x: hidden;
}
.my-data__grid {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.15fr) minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}
.my-data__widgets {
  grid-column: 1 / span 2;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}
.my-data__cell {
  display: flex;
  min-width: 0;
  min-height: 0;
}
.my-data__cell > * {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
.my-data__rail {
  grid-column: 3;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  position: sticky;
  top: 0;
  align-self: start;
}
.my-data__rail > .home-area--welcome {
  flex: 0 0 auto;
  height: auto;
}
@media (max-width: 1100px) {
  .my-data {
    height: auto;
    min-height: calc(100vh - 64px);
    overflow: visible;
  }
  .my-data__scroll {
    overflow: visible;
  }
  .my-data__grid {
    grid-template-columns: 1fr;
  }
  .my-data__widgets {
    grid-column: auto;
    grid-template-columns: 1fr;
    grid-auto-rows: auto !important;
  }
  .my-data__cell {
    grid-column: auto !important;
    grid-row: auto !important;
  }
  .my-data__rail {
    display: contents;
    height: auto;
  }
  .home-area--welcome {
    order: -1;
  }
}
</style>
