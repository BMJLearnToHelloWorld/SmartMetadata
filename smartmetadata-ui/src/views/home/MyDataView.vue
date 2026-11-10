<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Spin } from 'ant-design-vue';
import { listDomains } from '@/api/domains';
import { searchAssets } from '@/api/search';
import { assetLocation } from '@/catalog/entityRoutes';
import { searchRouteQuery, type SearchFilters } from '@/catalog/searchQuery';
import HomeHero from '@/features/home/HomeHero.vue';
import HomeLandingPageHeader from '@/features/home/HomeLandingPageHeader.vue';
import AnnouncementsRail from '@/features/home/widgets/AnnouncementsRail.vue';
import CriticalAnnouncements from '@/features/home/widgets/CriticalAnnouncements.vue';
import {
  EXCLUDED_WIDGET_FQNS,
  LANDING_PAGE_MAX_GRID_SIZE,
  LANDING_PAGE_WIDGET_HEIGHT_PX,
  LANDING_PAGE_WIDGET_KEYS,
  MY_DATA_WIDGET_KEYS,
  DEFAULT_LANDING_PAGE_LAYOUT,
  extractSavedLandingLayout,
  normalizeLandingPageLayout,
  type LandingPageLayoutItem,
} from '@/features/home/landingPageLayout';
import {
  resolveMyDataWidget,
  resolveMyDataWidgetBaseKey,
} from '@/features/home/landingPageWidgets';
import {
  domainFilters,
  followedAssetsQuery,
  ownedAssetsQuery,
  scopedSearchQuery,
  type AssetSort,
} from '@/features/home/homeQueries';
import { useAuthStore } from '@/stores/auth';
import { usePersonaStore } from '@/stores/persona';
import type { SearchHit } from '@/types/api';
import type { FacetBucket } from '@/catalog/searchFacets';
import type { Domain } from '@/types/governance';

/**
 * The landing page (stage B/C, G-11): the official 13-item grid over
 * the persona document's saved layout, normalized by
 * `normalizeLandingPageLayout`, rendered through the widget registry.
 * Every cell now carries its real widget; the four rewritten cards
 * (ActivityFeed, DataEstate, TotalDataAssets, KPI) fetch in their own
 * composables, and only YoursAndFollowed still takes central props.
 * Above the grid sit the critical-announcements banner (with the
 * greeting header as its fallback) and the announcements rail.
 *
 * ADR:2026-11-07-my-data-layout-normalization-five-params
 * ADR:2026-11-07-my-data-row-height-non-subdivided
 * ADR:2026-11-07-my-data-right-rail-keeps-home-hero
 * ADR:2026-11-08-my-data-announcements-rail
 * ADR:2026-11-08-my-data-greeting-header-home-hero-merge
 *
 * No customize entry lives here (B-1 is stage D), and no per-user
 * layout is read or written (B-6: per-persona only).
 */
const router = useRouter();
const auth = useAuthStore();
const persona = usePersonaStore();
const { t } = useI18n();

const loading = ref(false);
const selectedDomain = ref('');
const trackedSort = ref<AssetSort>('latest');

const serviceChips = ref<FacetBucket[]>([]);
const owned = ref<SearchHit[]>([]);
const followed = ref<SearchHit[]>([]);
const ownedTotal = ref(0);
const followedTotal = ref(0);
const domains = ref<Domain[]>([]);
const domainsUnavailable = ref(false);

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

const domainOptions = computed(() =>
  domains.value.map((domain) => ({
    value: domain.displayName || domain.name,
    label: domain.displayName || domain.name,
  })),
);
const assetSortOptions = computed(() => [
  { value: 'latest', label: t('home.sortLatest') },
  { value: 'name', label: t('home.sortName') },
]);
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

function onTrackedSort(value: unknown): void {
  if (value === 'latest' || value === 'name') {
    trackedSort.value = value;
  }
}

async function loadLanding(): Promise<void> {
  loading.value = true;
  const user = auth.user;
  const ownedQuery = ownedAssetsQuery(user);
  const followedQuery = followedAssetsQuery(user);
  const estateQuery = scopedSearchQuery('*', selectedDomain.value);
  try {
    // The estate search still runs centrally: only its service facet
    // feeds the HomeHero service chips. ActivityFeed, DataEstate,
    // TotalDataAssets and KPI fetch their own data now.
    const [estate, ownedPage, followedPage] = await Promise.all([
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
    ]);
    serviceChips.value = (estate.facets.find((facet) => facet.id === 'service')?.buckets ?? []).slice(0, 6);
    owned.value = ownedPage.hits;
    ownedTotal.value = ownedPage.total;
    followed.value = followedPage.hits;
    followedTotal.value = followedPage.total;
  } finally {
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
});

watch(selectedDomain, () => {
  if (layoutReady.value) {
    void loadLanding();
  }
});

/**
 * Props for the widget in a grid cell. Every self-fetching widget
 * takes its instance key (`widgetKey`); CuratedAssets additionally
 * reads its saved config off the layout by that key. Only
 * YoursAndFollowed still takes central props.
 */
function widgetProps(item: LandingPageLayoutItem): Record<string, unknown> {
  const baseKey = resolveMyDataWidgetBaseKey(item.i);
  switch (baseKey) {
    case LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED:
      return {
        owned: owned.value,
        followed: followed.value,
        ownedTotal: ownedTotal.value,
        followedTotal: followedTotal.value,
        sort: trackedSort.value,
        sortOptions: assetSortOptions.value,
      };
    case LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS:
      return { widgetKey: item.i, currentLayout: layout.value };
    default:
      return { widgetKey: item.i };
  }
}

type WidgetListener = (payload?: unknown) => void;

/** Event listeners for the widget in a grid cell, by registry base key. */
function widgetListeners(baseKey: string): Record<string, WidgetListener> {
  switch (baseKey) {
    case LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED:
      return {
        'change-sort': (value) => onTrackedSort(value),
        'open-hit': (value) => openHit(value as SearchHit),
        'open-owned-more': () => openOwnedMore(),
        'open-followed-more': () => openFollowedMore(),
        explore: () => goExplore(),
      };
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
        <div class="my-data__top">
          <CriticalAnnouncements>
            <template #fallback>
              <HomeLandingPageHeader />
            </template>
          </CriticalAnnouncements>
          <AnnouncementsRail />
        </div>
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
                v-bind="widgetProps(item)"
                v-on="widgetListeners(resolveMyDataWidgetBaseKey(item.i))"
              />
            </div>
          </div>
          <div class="my-data__rail">
            <HomeHero
              class="home-area home-area--welcome"
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
.my-data__top {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 14px;
}
.my-data__top:empty {
  display: none;
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
  .my-data__top {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 14px;
}
.my-data__top:empty {
  display: none;
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
