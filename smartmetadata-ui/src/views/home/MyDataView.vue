<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Empty, Select, Spin, Typography } from 'ant-design-vue';
import { listActivityEvents } from '@/api/activity';
import { listSystemChartData } from '@/api/dataInsights';
import { listDomains } from '@/api/domains';
import { listKpis } from '@/api/kpi';
import { searchAssets } from '@/api/search';
import { assetLocation } from '@/catalog/entityRoutes';
import { searchRouteQuery, type SearchFilters } from '@/catalog/searchQuery';
import HomeHero from '@/features/home/HomeHero.vue';
import HomeWidgetCard from '@/features/home/HomeWidgetCard.vue';
import {
  activityLabel,
  domainFilters,
  followedAssetsQuery,
  hitLabel,
  ownedAssetsQuery,
  scopedSearchQuery,
  sortCountBuckets,
  sortHits,
  type ActivityFilter,
  type AssetSort,
  type CountSort,
  type TotalRangeDays,
} from '@/features/home/homeQueries';
import { serviceTypeIcon } from '@/features/home/serviceTypeIcon';
import SmChart from '@/features/charts/SmChart.vue';
import { insightResultsToSeries } from '@/features/charts/series';
import { seriesWindow } from '@/features/charts/types';
import { useAuthStore } from '@/stores/auth';
import type { ActivityEvent } from '@/types/collaboration';
import type { FacetBucket } from '@/catalog/searchFacets';
import type { SearchHit } from '@/types/api';
import type { Kpi } from '@/types/kpi';
import type { Domain } from '@/types/governance';

const router = useRouter();
const auth = useAuthStore();
const { t, locale } = useI18n();

const loading = ref(false);
const selectedDomain = ref('');
const activityFilter = ref<ActivityFilter>('all');
const dataAssetSort = ref<CountSort>('high');
const ownedSort = ref<AssetSort>('latest');
const followedSort = ref<AssetSort>('latest');
const totalRange = ref<TotalRangeDays>(7);

const activity = ref<ActivityEvent[]>([]);
const serviceBuckets = ref<FacetBucket[]>([]);
const serviceChips = ref<FacetBucket[]>([]);
const entityBuckets = ref<FacetBucket[]>([]);
const catalogTotal = ref(0);
const owned = ref<SearchHit[]>([]);
const followed = ref<SearchHit[]>([]);
const kpis = ref<Kpi[]>([]);
const domains = ref<Domain[]>([]);
const domainsUnavailable = ref(false);
const totalSeries = ref<ReturnType<typeof insightResultsToSeries>>([]);
const kpiTried = ref(false);

const userName = computed(() => auth.displayName || auth.user?.name || '');
const domainOptions = computed(() =>
  domains.value.map((domain) => ({
    value: domain.displayName || domain.name,
    label: domain.displayName || domain.name,
  })),
);
const visibleActivity = computed(() =>
  activityFilter.value === 'all'
    ? activity.value
    : activity.value.filter((event) => event.eventType === activityFilter.value),
);
const activityOptions = computed(() => [
  { value: 'all', label: t('home.allActivity') },
  ...[...new Set(activity.value.map((event) => event.eventType))].map((value) => ({
    value,
    label: value,
  })),
]);
const sortedServices = computed(() => sortCountBuckets(serviceBuckets.value, dataAssetSort.value));
const sortedOwned = computed(() => sortHits(owned.value, ownedSort.value));
const sortedFollowed = computed(() => sortHits(followed.value, followedSort.value));
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

function kpiLabel(kpi: Kpi): string {
  return kpi.displayName || kpi.name;
}

function kpiCurrent(kpi: Kpi): string {
  return kpi.kpiResult?.targetResult[0]?.value || '—';
}

function onActivityFilter(value: unknown): void {
  activityFilter.value = typeof value === 'string' ? value : 'all';
}

function onDataAssetSort(value: unknown): void {
  if (value === 'high' || value === 'low') {
    dataAssetSort.value = value;
  }
}

function onOwnedSort(value: unknown): void {
  if (value === 'latest' || value === 'name') {
    ownedSort.value = value;
  }
}

function onFollowedSort(value: unknown): void {
  if (value === 'latest' || value === 'name') {
    followedSort.value = value;
  }
}

function onTotalRange(value: unknown): void {
  if (value === 7 || value === 30) {
    totalRange.value = value;
  }
}

function formatAxisLabel(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' });
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
    followed.value = followedPage.hits;
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

onMounted(() => {
  if (auth.isAuthenticated) {
    void auth.refreshUser().catch(() => undefined);
  }
  void loadDomains();
  void loadLanding();
  void loadCharts(totalRange.value);
});

watch(selectedDomain, () => {
  void loadLanding();
});

watch(totalRange, (days) => {
  void loadCharts(days);
});
</script>

<template>
  <div class="my-data" data-testid="my-data-page">
    <HomeHero
      :user-name="userName"
      :domains="domainOptions"
      :selected-domain="selectedDomain"
      :service-chips="serviceChips"
      :domains-unavailable="domainsUnavailable"
      @search="onHeroSearch"
      @update:selected-domain="selectedDomain = $event"
      @select-service="onSelectServiceName"
    />
    <Spin :spinning="loading">
      <div class="my-data__grid">
        <HomeWidgetCard :title="t('home.activity')" test-id="home-widget-activity">
          <template #extra>
            <Select
              data-testid="home-activity-filter"
              size="small"
              :value="activityFilter"
              :options="activityOptions"
              :bordered="false"
              @change="onActivityFilter"
            />
          </template>
          <Empty
            v-if="!visibleActivity.length"
            data-testid="home-activity-empty"
            :description="t('home.activityEmptyTitle')"
          >
            <template #description>
              <Typography.Title :level="5">{{ t('home.activityEmptyTitle') }}</Typography.Title>
              <Typography.Paragraph type="secondary">{{ t('home.activityEmpty') }}</Typography.Paragraph>
            </template>
            <Button data-testid="home-explore-assets" @click="goExplore()">{{ t('home.exploreAssets') }}</Button>
          </Empty>
          <ul v-else class="home-list" data-testid="home-activity-list">
            <li v-for="event in visibleActivity" :key="event.id">
              <button
                type="button"
                class="home-list__row"
                :data-testid="`home-activity-row-${event.id}`"
                @click="openActivity(event)"
              >
                {{ activityLabel(event) }}
              </button>
            </li>
          </ul>
        </HomeWidgetCard>

        <HomeWidgetCard :title="t('home.dataAssets')" test-id="home-widget-data-assets">
          <template #extra>
            <Select
              data-testid="home-data-assets-sort"
              size="small"
              :value="dataAssetSort"
              :options="countSortOptions"
              :bordered="false"
              @change="onDataAssetSort"
            />
          </template>
          <div v-if="sortedServices.length" class="home-services" data-testid="home-data-assets-grid">
            <button
              v-for="bucket in sortedServices"
              :key="bucket.key"
              type="button"
              class="home-services__tile"
              :data-testid="`home-service-${bucket.key}`"
              @click="onSelectServiceType(bucket.key)"
            >
              <component :is="serviceTypeIcon(bucket.key)" class="home-services__icon" />
              <span class="home-services__name">{{ bucket.key }}</span>
              <span class="home-services__count">{{ formatCount(bucket.count) }}</span>
            </button>
          </div>
          <Empty v-else data-testid="home-data-assets-empty" :description="t('home.dataAssetsEmpty')" />
        </HomeWidgetCard>

        <HomeWidgetCard :title="t('home.contextCenter')" test-id="home-widget-context">
          <Empty data-testid="home-context-empty" :description="t('home.contextEmptyTitle')">
            <template #description>
              <Typography.Title :level="5">{{ t('home.contextEmptyTitle') }}</Typography.Title>
              <Typography.Paragraph type="secondary">{{ t('home.contextEmpty') }}</Typography.Paragraph>
            </template>
          </Empty>
        </HomeWidgetCard>

        <HomeWidgetCard :title="t('home.myData')" test-id="home-widget-my-data">
          <template #extra>
            <Select
              data-testid="home-owned-sort"
              size="small"
              :value="ownedSort"
              :options="assetSortOptions"
              :bordered="false"
              @change="onOwnedSort"
            />
            <Button type="link" data-testid="home-owned-more" @click="openOwnedMore">{{ t('home.viewMore') }}</Button>
          </template>
          <ul v-if="sortedOwned.length" class="home-list" data-testid="home-owned-list">
            <li v-for="hit in sortedOwned" :key="hit.fullyQualifiedName || hit.name">
              <button type="button" class="home-list__row" :data-testid="`home-owned-${hit.name}`" @click="openHit(hit)">
                {{ hitLabel(hit) }}
              </button>
            </li>
          </ul>
          <Empty v-else data-testid="home-owned-empty" :description="t('home.myDataEmpty')" />
        </HomeWidgetCard>

        <HomeWidgetCard :title="t('home.kpi')" test-id="home-widget-kpi">
          <ul v-if="kpis.length" class="home-list" data-testid="home-kpi-list">
            <li v-for="kpi in kpis" :key="kpi.name">
              <div class="home-list__row home-list__row--static" :data-testid="`home-kpi-${kpi.name}`">
                <span>{{ kpiLabel(kpi) }}</span>
                <span>{{ kpiCurrent(kpi) }}</span>
              </div>
            </li>
          </ul>
          <Empty v-else-if="kpiTried" data-testid="home-kpi-empty" :description="t('home.kpiEmptyTitle')">
            <template #description>
              <Typography.Title :level="5">{{ t('home.kpiEmptyTitle') }}</Typography.Title>
              <Typography.Paragraph type="secondary">{{ t('home.kpiEmpty') }}</Typography.Paragraph>
            </template>
            <Button data-testid="home-setup-kpi" @click="openKpiSetup">{{ t('home.setupKpi') }}</Button>
          </Empty>
        </HomeWidgetCard>

        <HomeWidgetCard :title="t('home.totalAssets')" test-id="home-widget-total">
          <template #extra>
            <Select
              data-testid="home-total-range"
              size="small"
              :value="totalRange"
              :options="rangeOptions"
              :bordered="false"
              @change="onTotalRange"
            />
          </template>
          <div class="home-total" data-testid="home-total-body">
            <div class="home-total__count" data-testid="home-total-count">{{ formattedTotal }}</div>
            <SmChart
              kind="donut"
              test-id="home-total-chart"
              :series="donutSeries"
              :empty="t('home.chartEmpty')"
              :height="180"
            />
            <div v-if="totalAxisLabels.length" class="home-total__axis" data-testid="home-total-axis">
              <span v-for="label in totalAxisLabels" :key="label">{{ formatAxisLabel(label) }}</span>
            </div>
          </div>
        </HomeWidgetCard>

        <HomeWidgetCard :title="t('home.following')" test-id="home-widget-following">
          <template #extra>
            <Select
              data-testid="home-followed-sort"
              size="small"
              :value="followedSort"
              :options="assetSortOptions"
              :bordered="false"
              @change="onFollowedSort"
            />
            <Button type="link" data-testid="home-followed-more" @click="openFollowedMore">{{ t('home.viewMore') }}</Button>
          </template>
          <ul v-if="sortedFollowed.length" class="home-list" data-testid="home-followed-list">
            <li v-for="hit in sortedFollowed" :key="hit.fullyQualifiedName || hit.name">
              <button type="button" class="home-list__row" :data-testid="`home-followed-${hit.name}`" @click="openHit(hit)">
                {{ hitLabel(hit) }}
              </button>
            </li>
          </ul>
          <Empty v-else data-testid="home-following-empty" :description="t('home.followingEmptyTitle')">
            <template #description>
              <Typography.Title :level="5">{{ t('home.followingEmptyTitle') }}</Typography.Title>
              <Typography.Paragraph type="secondary">{{ t('home.followingEmpty') }}</Typography.Paragraph>
            </template>
            <Button data-testid="home-following-explore" @click="goExplore()">{{ t('home.exploreAssets') }}</Button>
          </Empty>
        </HomeWidgetCard>
      </div>
    </Spin>
  </div>
</template>

<style scoped>
.my-data {
  background: var(--sm-content-bg);
  min-height: 100%;
}
.my-data__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  padding: 20px 24px 32px;
}
.home-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.home-list__row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 8px 4px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--sm-text-primary);
}
.home-list__row:hover {
  background: var(--sm-row-hover-bg);
  color: var(--sm-color-primary);
}
.home-list__row--static {
  cursor: default;
}
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
  font-weight: 600;
}
.home-total {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.home-total__count {
  font-size: 32px;
  font-weight: 650;
  color: var(--sm-text-primary);
}
.home-total__axis {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
@media (max-width: 1100px) {
  .my-data__grid {
    grid-template-columns: 1fr;
  }
}
</style>
