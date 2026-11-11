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
import LimitWrapper from '@/components/shared/LimitWrapper.vue';
import HomeHero from '@/features/home/HomeHero.vue';
import HomeLandingPageHeader from '@/features/home/HomeLandingPageHeader.vue';
import TopicsSectionHeader from '@/features/home/TopicsSectionHeader.vue';
import WelcomeScreen from '@/features/home/WelcomeScreen.vue';
import { useFirstLoginWelcome } from '@/features/home/useFirstLoginWelcome';
import { useTopicsView, type TopicsViewMode } from '@/features/home/useTopicsView';
import AnnouncementsRail from '@/features/home/widgets/AnnouncementsRail.vue';
import CriticalAnnouncements from '@/features/home/widgets/CriticalAnnouncements.vue';
import {
  EXCLUDED_WIDGET_FQNS,
  LANDING_PAGE_MAX_GRID_SIZE,
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
 * Stage D adds the topics section header (collapse-all + list/grid
 * view controls + the customize entry, admin + persona only), the
 * first-login welcome (which replaces the grid, never the rail), and
 * the hidden data-assets limit driver for the global banner.
 *
 * ADR:2026-11-07-my-data-layout-normalization-five-params
 * ADR:2026-11-07-my-data-row-height-non-subdivided
 * ADR:2026-11-07-my-data-right-rail-keeps-home-hero
 * ADR:2026-11-08-my-data-announcements-rail
 * ADR:2026-11-08-my-data-greeting-header-home-hero-merge
 * ADR:2026-11-10-my-data-customize-page-drag
 * ADR:2026-11-10-my-data-limit-banner-no-plans-link
 *
 * The header colour is NOT tinted here: pin has no production
 * home-page consumer for it (R-G11D-1) — it is written and previewed
 * in the editor only.
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

/**
 * Stage D view state: collapse + grid/list over the renderable
 * layout, rendered at the subdivided row height (21.3325px) so a
 * collapsed card takes three quarter-rows (~96px) instead of a full
 * row. The overrides are derived, never written back.
 */
const topics = useTopicsView(renderableLayout);

/** Stage D first-login welcome: once per user, never on the tour. */
const { showWelcome, closeWelcome } = useFirstLoginWelcome();

/**
 * Stage D customize entry (B-1 (a)): admins only, and only when a
 * persona is in play — the editor customizes one persona's page.
 */
/**
 * The Customise entry shows whenever a persona is selected, as in
 * official — the admin gate lives at the editor route, not here.
 * ADR:2026-11-11-home-style-compaction-and-tokens
 */
const canCustomize = computed(() => persona.selectedPersona !== null);

function goCustomize(): void {
  const selected = persona.selectedPersona;
  if (!selected) {
    return;
  }
  void router.push({
    name: 'customize-page',
    params: { fqn: selected.fullyQualifiedName, pageFqn: 'LandingPage' },
  });
}

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
 *
 * Stage D collapse (official TopicWidget header strip): every card
 * gets `collapsible` + its collapsed state + the toggle, which fall
 * through the widget to its root HomeWidgetCard — no widget forwards
 * them explicitly.
 */
function widgetProps(item: LandingPageLayoutItem): Record<string, unknown> {
  const baseKey = resolveMyDataWidgetBaseKey(item.i);
  const collapse = {
    collapsible: true,
    collapsed: topics.collapseValue.value.isCollapsed(item.i),
    onToggleCollapse: () => topics.collapseValue.value.toggle(item.i),
  };
  switch (baseKey) {
    case LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED:
      return {
        widgetKey: item.i,
        owned: owned.value,
        followed: followed.value,
        ownedTotal: ownedTotal.value,
        followedTotal: followedTotal.value,
        sort: trackedSort.value,
        sortOptions: assetSortOptions.value,
        ...collapse,
      };
    case LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS:
      return { widgetKey: item.i, currentLayout: layout.value, ...collapse };
    default:
      return { widgetKey: item.i, ...collapse };
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

/**
 * The cell's grid placement, from the topics view's subdivided
 * layout. Grid mode places explicitly (row height 21.3325px); list
 * mode is one column, auto-placed in reading order, each cell
 * spanning its subdivided height.
 */
function cellStyle(
  item: { x: number; y: number; w: number; h: number },
  viewMode: TopicsViewMode,
): Record<string, string> {
  if (viewMode === 'list') {
    return { gridColumn: '1', gridRow: `span ${item.h}` };
  }
  return {
    gridColumn: `${item.x + 1} / span ${item.w}`,
    gridRow: `${item.y + 1} / span ${item.h}`,
  };
}
</script>

<template>
  <!-- The topics section exists now (stage D), so the tour step targets
       its header via data-tour-step="topics-to-catch-up-on". -->
  <div class="my-data" data-testid="my-data-page" data-tour-page>
    <div v-if="!layoutReady" class="my-data__skeleton" data-testid="home-landing-skeleton">
      <div v-for="n in 6" :key="n" class="my-data__skeleton-card" />
    </div>
    <Spin v-else :spinning="loading">
      <!-- First login: the welcome owns the page — greeting,
           announcements rail and grid all stand down. -->
      <div v-if="showWelcome" class="my-data__scroll">
        <WelcomeScreen :on-close="closeWelcome" />
      </div>
      <div v-else class="my-data__scroll">
        <div class="my-data__top">
          <CriticalAnnouncements>
            <template #fallback>
              <HomeLandingPageHeader />
            </template>
          </CriticalAnnouncements>
          <!-- No right rail: the hero sits full-width under the
               greeting, the welcome area at the top of the flow. -->
          <HomeHero
            :domains="domainOptions"
            :selected-domain="selectedDomain"
            :service-chips="serviceChips"
            :domains-unavailable="domainsUnavailable"
            @search="onHeroSearch"
            @update:selected-domain="selectedDomain = $event"
            @select-service="onSelectServiceName"
          />
          <AnnouncementsRail />
        </div>
        <div class="my-data__topics">
          <TopicsSectionHeader
            :is-every-widget-collapsed="topics.isEveryWidgetCollapsed.value"
            :is-layout-empty="topics.displayLayout.value.length === 0"
            :view-mode="topics.viewMode.value"
            :on-customize="canCustomize ? goCustomize : undefined"
            @toggle-all="topics.toggleAll()"
            @view-mode-change="topics.setViewMode($event)"
          />
          <!-- The grid remounts on a view-mode switch, exactly as
               official keys it by viewMode. -->
          <div
            :key="topics.viewMode.value"
            class="my-data__widgets"
            data-testid="home-landing-grid"
            :style="{
              gridAutoRows: `${topics.rowHeight}px`,
              gridTemplateColumns:
                topics.viewMode.value === 'list' ? '1fr' : undefined,
            }"
          >
            <div
              v-for="item in topics.displayLayout.value"
              :key="`${item.i}-${item.x}-${item.y}`"
              class="my-data__cell"
              data-testid="home-widget-cell"
              :style="cellStyle(item, topics.viewMode.value)"
            >
              <component
                :is="resolveMyDataWidget(item.i)"
                v-bind="widgetProps(item)"
                v-on="widgetListeners(resolveMyDataWidgetBaseKey(item.i))"
              />
            </div>
          </div>
        </div>
      </div>
      <!-- Stage D: the hidden data-assets limit driver — it fetches
           the resource limit purely to drive the global banner (the
           wrapper's own loading skeleton stays hidden with it). It
           mounts in both states so the banner still works on first
           login. -->
      <div class="my-data__limit-driver" aria-hidden="true">
        <LimitWrapper resource="dataAssets">
          <span />
        </LimitWrapper>
      </div>
    </Spin>
  </div>
</template>

<style scoped>
.my-data {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: calc(100vh - var(--sm-header-height, 64px) - var(--sm-banner-height, 0px));
  padding: 0 6px 6px 12px;
  overflow: hidden;
  background: var(--sm-content-bg);
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
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 20px;
  border-radius: 16px;
  background: var(--sm-home-canvas);
}
.my-data__skeleton-card {
  height: 132px;
  border-radius: var(--sm-radius-card);
  background: var(--sm-bg-elevated);
}
.my-data__scroll {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 20px 20px 48px;
  border-radius: 16px;
  background: var(--sm-home-canvas);
  overflow-y: auto;
  overflow-x: hidden;
}
.my-data__top {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-bottom: 24px;
}
.my-data__top:empty {
  display: none;
}
.my-data__topics {
  min-width: 0;
}
.my-data__widgets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  min-width: 0;
}
.my-data__limit-driver {
  display: none;
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
@media (max-width: 1100px) {
  .my-data {
    height: auto;
    min-height: calc(100vh - var(--sm-header-height, 64px) - var(--sm-banner-height, 0px));
    overflow: visible;
  }
  .my-data__scroll {
    overflow: visible;
  }
}
</style>
