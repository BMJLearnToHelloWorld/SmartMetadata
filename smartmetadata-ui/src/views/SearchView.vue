<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Dropdown, Empty, Input, Menu, Pagination, Select, Space, Switch, Tag, Typography, message } from 'ant-design-vue';
import { prefetchAssetDetail } from '@/api/entities';
import { ApiError, readErrorMessage } from '@/api/client';
import { markCsvJobOwned, notifyCsvJobsRefresh } from '@/api/csvJobs';
import { EXPORT_ALL_ASSETS_LIMIT, exportSearchResultsAsync } from '@/api/search';
import {
  MAX_RESULT_HITS,
  SEARCH_EXCLUDE_SOURCE_FIELDS,
  entityTypeCountsFromPage,
  nlqSearch,
  searchAssets,
  searchEntityTypeCounts,
} from '@/api/search';
import { getTableShardingByName } from '@/api/tables';
import { createExploreCache } from '@/catalog/exploreCache';
import { findShardedFamilies, type ShardedFamilyTable } from '@/catalog/tableSharding';
import {
  buildQueryFilter,
  createQueryRule,
  emptyQueryGroup,
  findFieldDef,
  isTreeComplete,
  parseElasticsearchQuery,
  queryFilterToSql,
  type QueryBuilderFieldDef,
  type QueryGroup,
} from '@/catalog/queryBuilder';
import {
  EXPLORE_TABS,
  defaultSortForTab,
  exploreSortFromQuery,
  exploreTabFromRoute,
  facetsForTab,
  findActiveSearchIndex,
  sortOptionsForTab,
  type ExploreSort,
  type ExploreTab,
} from '@/catalog/exploreTabs';
import {
  browsePathLabels,
  buildEstateTree,
  estateChildNodes,
  estateDrill,
  estateFromQuery,
  filtersForEstateNode,
  findEstateNode,
  selectedEstateFromFilters,
  type EstateNode,
} from '@/catalog/browseEstate';
import { assetLocation, detailLocationForHit, lineageLocation, openSearchHit, parentTableLocation } from '@/catalog/entityRoutes';
import {
  cardBreadcrumbs,
  cardDescriptionNeedles,
  cardDisplayName,
  cardMatches,
  cardNameNeedles,
  shouldPrefetchCard,
} from '@/catalog/exploreCard';
import { entityIconFor } from '@/catalog/entityIcons';
import { NULL_OPTION_KEY, type FacetId, type SearchFacet } from '@/catalog/searchFacets';
import { buildRankingDetails, type RankingDetails } from '@/catalog/rankingDetails';
import { hitLocation } from '@/catalog/searchHits';
import { getUsagePercentile } from '@/catalog/usagePercentile';
import {
  DEFAULT_EXPLORE_PAGE_SIZE,
  DEFAULT_SORT,
  EXPLORE_PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
  composeSearchQuery,
  filtersFromQuery,
  filtersToQuery,
  hasActiveFilters,
  isIndexNotFoundError,
  mergeQueryFilters,
  nullExistsQueryFilter,
  pageFromQuery,
  pageSizeFromQuery,
  sortField,
  sortFromQuery,
  type SearchFilters,
} from '@/catalog/searchQuery';
import FormModal from '@/components/shared/FormModal.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmProfilePicture from '@/components/shared/SmProfilePicture.vue';
import SearchEntityIcon from '@/components/shared/SearchEntityIcon.vue';
import HighlightedText from '@/components/ingestion/HighlightedText.vue';
import DomainFilterChip from '@/components/ingestion/DomainFilterChip.vue';
import { useAuthStore } from '@/stores/auth';
import { useDomainStore } from '@/stores/domain';
import AdvancedSearchBuilder from '@/features/explore/AdvancedSearchBuilder.vue';
import ExploreEstateTree from '@/features/explore/ExploreEstateTree.vue';
import ExploreExportScopeModal, { type ExportScope } from '@/features/explore/ExploreExportScopeModal.vue';
import ExploreFilterChips from '@/features/explore/ExploreFilterChips.vue';
import ExplorePreview from '@/features/explore/ExplorePreview.vue';
import ExploreRankingDetails from '@/features/explore/ExploreRankingDetails.vue';
import { useAdvancedSearchFields } from '@/features/explore/useAdvancedSearchFields';
import { useSearchStore } from '@/stores/search';
import { useFacetOptions } from '@/features/explore/useFacetOptions';
import type { SearchHit } from '@/types/api';
import { readGlobalPageSize, writeGlobalPageSize } from '@/utils/userPageSizePreference';

const route = useRoute();
const router = useRouter();
const { t, te } = useI18n();
const authStore = useAuthStore();
const searchStore = useSearchStore();
// D35: the domain store is only hydrated by DomainSelect, which is not
// mounted anywhere in the shell — Explore hydrates it itself so a
// persisted pick surfaces in the filter chip below. The list fetch runs
// only when an id is actually stored: without one there is nothing to
// resolve, and the chip stays hidden.
const domainStore = useDomainStore();
domainStore.hydrate();
if (domainStore.activeDomainId) {
  void domainStore.loadDomains();
}

/**
 * D31: the 30s SWR search cache (catalog/exploreCache.ts, STALE_TIME_MS
 * = 30_000, mirroring official hooks/useExploreCache.ts). One cache per
 * mounted Explore view: results, counts and sharded-family lookups for
 * one search key share it, and leaving the page drops it.
 */
const exploreCache = createExploreCache();

const loading = ref(false);
const errorMessage = ref('');
const indexNotFound = ref(false);
const advancedOpen = ref(false);
// Tools → Ranking details (D12): pin's ExplorePageV1 holds this as
// page-local state (`useState(false)`), not persisted, not in the URL.
const showRankingDetails = ref(false);
const advancedFreeText = ref('');
const advancedTree = ref<QueryGroup>(emptyQueryGroup());
const advancedFields = useAdvancedSearchFields();
// Official Explore export (ExploreV1.component.tsx:697-708): scope modal
// state. exportScope resets to 'all' on every open (pin
// handleOpenExportScopeModal).
const showExportScopeModal = ref(false);
const toolsOpen = ref(false);
const exportScope = ref<ExportScope>('all');
const isExporting = ref(false);
const isCountLoading = ref(false);
const allAssetsCount = ref<number | undefined>(undefined);
const tabAssetsCount = ref<number | undefined>(undefined);
const exportError = ref('');
const hits = ref<SearchHit[]>([]);
const total = ref(0);
const facets = ref<SearchFacet[]>([]);
// D11 echo: the NLQ response's backend-detected filter fields
// (applied_quick_filters.fieldList); empty on keyword searches.
const nlqAppliedFilters = ref<string[]>([]);
const estateFacets = ref<SearchFacet[]>([]);
const estateChildMap = ref<Record<string, EstateNode[]>>({});
const estateLoadingKeys = ref<Set<string>>(new Set());
const expandedKeys = ref<string[]>([]);
const selectedFqn = ref('');
/**
 * D4: per-type counts from GET /v1/search/entityTypeCounts for the
 * current query, with the query key they were fetched for. A stale
 * response for a superseded query never overwrites the current one
 * (see loadTypeCounts); the key also gates D3 hiding.
 */
const typeCounts = ref<Map<string, number> | null>(null);
const typeCountsKey = ref('');
/** D17: sharded tables the query names (pin "Matching sharded families"). */
const shardedFamilies = ref<ShardedFamilyTable[]>([]);

const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''));
const filters = computed(() => filtersFromQuery(route.query));
/**
 * A saved query filter carried on the URL (CuratedAssets "View all
 * matches" for a saved advanced filter, and its editor's Explore link).
 * Official Explore reads the same `queryFilter`/`quickFilter` URL params;
 * this console's only verified search surface is GET /v1/search/query,
 * whose `query_filter` string the API already accepts — the value is
 * passed through verbatim, never composed into the Lucene query.
 */
const queryFilter = computed(() =>
  typeof route.query.query_filter === 'string' ? route.query.query_filter : undefined,
);
/**
 * The tab from the URL (`/explore/:tab`, pin `ROUTES.EXPLORE_WITH_TAB`),
 * and the tab the page is effectively showing: the URL tab when one is
 * named, else the auto-selected tab pin's `findActiveSearchIndex`
 * picks from the counts while a query is present (state, not URL — pin
 * keeps `autoSelectedSearchIndex` in state and the URL stays
 * `/explore`). Without a query there is no auto-select and the page is
 * the dataAsset browse view.
 */
const activeTab = computed<ExploreTab | null>(() => exploreTabFromRoute(route));
const autoSelectedTab = ref<ExploreTab | null>(null);
const effectiveTab = computed<ExploreTab | null>(() => activeTab.value ?? autoSelectedTab.value);
/**
 * Advanced-search field config for the active tab (pin `getTreeConfig`
 * per search index) and for the applied-filter SQL text. The SQL text
 * renders against the `dataAsset` union, so a filter built on another tab
 * (or a CuratedAssets saved filter) still renders when this tab's field
 * set does not contain its fields.
 */
const advancedFieldDefs = computed<QueryBuilderFieldDef[]>(() =>
  advancedFields.fieldsForTab(effectiveTab.value?.index ?? 'dataAsset'),
);
const advancedSqlFields = computed<QueryBuilderFieldDef[]>(() =>
  advancedFields.fieldsForTab('dataAsset'),
);
const advancedSql = computed(() => queryFilterToSql(queryFilter.value, advancedSqlFields.value));
/** An empty root group applies as "clear the filter"; any other tree must be complete. */
const advancedCanApply = computed(
  () => advancedTree.value.children.length === 0 || isTreeComplete(advancedTree.value, advancedFieldDefs.value),
);
/**
 * The filter sent to the server: the saved `query_filter` from the URL
 * plus the "No X" (must_not.exists) clauses for the active filters (pin
 * ExplorePureUtils.getExploreQueryFilterMust). The URL keeps only the
 * facet params and the saved filter; the null clauses are derived, never
 * written back to the URL.
 */
const effectiveQueryFilter = computed(() =>
  mergeQueryFilters(queryFilter.value, nullExistsQueryFilter(filters.value)),
);
const page = computed(() => pageFromQuery(route.query.page));
const showDeleted = computed(() => route.query.showDeleted === 'true');
const pageSize = computed(() => pageSizeFromQuery(route.query.pageSize, readGlobalPageSize(window.localStorage, authStore.user?.name)));
const estateId = computed(() => estateFromQuery(route.query) || selectedEstateFromFilters(filters.value));
const sortOptions = computed(() => {
  const base = effectiveTab.value
    ? sortOptionsForTab(effectiveTab.value)
    : SORT_OPTIONS.map((option) => ({ id: option.id, field: option.field, defaultOrder: option.defaultOrder }));
  if (!effectiveTab.value) {
    return base;
  }
  // D33 pin quirk: the API tabs default to totalVotes although the tag
  // sorting group has no popularity option. The dropdown carries the
  // default as well, so the sort label never renders blank.
  const fallback = defaultSortForTab(effectiveTab.value);
  return base.some((option) => option.id === fallback.id) ? base : [...base, fallback];
});
const currentSort = computed<ExploreSort>(() => {
  if (effectiveTab.value) {
    return exploreSortFromQuery(route.query, effectiveTab.value);
  }
  const base = sortFromQuery(route.query);
  return { id: base.id, order: base.order, field: sortField(base) };
});

/**
 * Chip options with official's per-facet self-exclusion: the main-search
 * facets stay the chips' options until a chip's dropdown opens, when
 * useFacetOptions fetches that facet's options without its own filter
 * (ADR:2026-11-11-explore-facet-self-exclusion).
 */
const facetOptions = useFacetOptions(() => ({
  query: query.value,
  filters: filters.value,
  index: effectiveTab.value?.index ?? 'dataAsset',
  deleted: showDeleted.value,
  queryFilter: queryFilter.value,
}));
const chipFacets = computed<SearchFacet[]>(() => {
  const base = facets.value.length ? facets.value : estateFacets.value;
  const byId = new Map(base.map((facet) => [facet.id, facet]));
  for (const [id, facet] of Object.entries(facetOptions.chipFacets.value)) {
    byId.set(id as FacetId, facet);
  }
  return [...byId.values()];
});
watch(facets, (next) => facetOptions.rememberFacets(next));
/**
 * D4: the counts request is keyed by everything that narrows it — the
 * text query, the chip filters (which travel as Lucene in the counts
 * `q`, as pin's travel in its `queryFilter`), the deleted flag and the
 * saved `query_filter`. The tab is deliberately excluded: counts span
 * every tab index, so they stay valid across tab switches.
 */
const countsKey = computed(() =>
  JSON.stringify({
    q: query.value.trim(),
    filters: filters.value,
    deleted: showDeleted.value,
    queryFilter: queryFilter.value,
  }),
);
const countsForCurrentQuery = computed(() =>
  typeCounts.value !== null && typeCountsKey.value === countsKey.value ? typeCounts.value : null,
);
/** D3 may hide tabs only when counts cover every tab (the counts endpoint). */
const countsComplete = computed(() => countsForCurrentQuery.value !== null);

/**
 * Per-tab filter sets (pin SearchClassBase.getDropDownItems): the chips
 * change with the tab instead of the fixed 9 for every tab. The glossary
 * Status chip only earns its place once some entity has left Unprocessed
 * (pin ExploreQuickFilters hasReviewedStatus) — or while it holds a
 * selection, so an active Status filter never hides itself.
 */
const chipFacetIds = computed<FacetId[]>(() => {
  const ids = facetsForTab(effectiveTab.value);
  if (!ids.includes('entityStatus')) {
    return ids;
  }
  const hasStatusValue = (filters.value.entityStatus?.length ?? 0) > 0;
  if (facetOptions.hasReviewedEntityStatus.value || hasStatusValue) {
    return ids;
  }
  return ids.filter((id) => id !== 'entityStatus');
});

/**
 * Active-filter tags cover the current tab's chips plus any filter that
 * is active but belongs to another tab: tab switches keep filters (D30
 * is a separate lane), so an off-tab filter must stay visible and
 * removable instead of silently applied.
 */
const activeFilterIds = computed<FacetId[]>(() => {
  const active = (Object.keys(filters.value) as FacetId[]).filter(
    (id) => (filters.value[id]?.length ?? 0) > 0,
  );
  const inChips = chipFacetIds.value.filter((id) => active.includes(id));
  const offTab = active.filter((id) => !chipFacetIds.value.includes(id));
  return [...inChips, ...offTab];
});

// Pin ExploreQuickFilters hasReviewedStatus effect: re-check whether any
// glossary entity has left Unprocessed whenever the glossary context
// (tab, saved filter, deleted flag) changes.
watch(
  () =>
    JSON.stringify({
      tab: effectiveTab.value?.index ?? null,
      queryFilter: queryFilter.value,
      deleted: showDeleted.value,
    }),
  () => {
    if (effectiveTab.value?.index === 'glossaryTerm') {
      void facetOptions.checkEntityStatus();
    }
  },
  { immediate: true },
);
const tabCounts = computed(() => {
  const counts = new Map<string, number>();
  if (countsForCurrentQuery.value) {
    for (const [key, value] of countsForCurrentQuery.value) {
      counts.set(key, value);
    }
  } else {
    const facet = facets.value.find((item) => item.id === 'entityType');
    for (const bucket of facet?.buckets ?? []) {
      counts.set(bucket.key, bucket.count);
    }
  }
  // Official publishCounts behaviour: the active tab's count is the current
  // page's result total, not the aggregation bucket. Other tabs keep their
  // counts; on a failed search the total is a reset 0, not a result count,
  // so it must not overwrite the bucket into a misleading (0).
  if (effectiveTab.value && !errorMessage.value) {
    counts.set(effectiveTab.value.entityType, total.value);
  }
  return counts;
});
/**
 * D14 (pin ExploreV1 exploreLeftPanel): while a query is typed the left
 * aside shows the tabs vertically — icon + truncating label + count
 * badge, click switches tab — instead of the estate tree. Pin renders no
 * all-tab (getTabsInfo() has 24 entries, no DATA_ASSET), so neither does
 * this list. D3 (ExplorePageV1.component.tsx:327-342): with a query,
 * hide zero-result tabs, keeping the active tab (so the tab control
 * never loses its selection). Hiding applies only on complete counts:
 * a missing bucket on partial aggregation counts is unknown, not zero.
 * Counts come from the counts endpoint when a query is present, else
 * from the current search's entityType aggregation; tabs with no bucket
 * stay count-less (unknown, not 0) on partial counts.
 */
const leftPanelItems = computed(() => {
  const items: Array<{ key: string; label: string; iconType: string; count?: number }> = [];
  for (const tab of EXPLORE_TABS) {
    items.push({
      key: tab.index,
      label: t(`explore.entity.${tab.labelKey}`),
      iconType: tab.entityType,
      count: tabCounts.value.get(tab.entityType),
    });
  }
  if (!query.value.trim() || !countsComplete.value) {
    return items;
  }
  return items.filter((item) => {
    if (item.key === effectiveTab.value?.index) {
      return true;
    }
    const tab = EXPLORE_TABS.find((entry) => entry.index === item.key);
    return tab !== undefined && (tabCounts.value.get(tab.entityType) ?? 0) > 0;
  });
});
const searchKey = computed(() =>
  JSON.stringify({
    q: query.value,
    filters: filters.value,
    queryFilter: queryFilter.value,
    page: page.value,
    pageSize: pageSize.value,
    showDeleted: showDeleted.value,
    showRankingDetails: showRankingDetails.value,
    // D11: flipping the NLP toggle refires the search through the NLQ
    // path (or back to keyword) without a navigation.
    nlq: searchStore.isNLPActive && searchStore.isNLPEnabled,
    sort: currentSort.value,
    estate: estateFromQuery(route.query),
    tab: activeTab.value?.index ?? 'all',
  }),
);

/**
 * Ranking sections for the current hits, keyed by hit object. Built only
 * while the toggle is on — pin's `SearchedData` passes the hit's score,
 * explanation and matched queries to the card only then, and the search
 * only carries them when it sent `explain: true`.
 */
const rankingByHit = computed(() => {
  const byHit = new Map<SearchHit, RankingDetails>();
  if (!showRankingDetails.value) {
    return byHit;
  }
  for (const hit of hits.value) {
    const details = buildRankingDetails(hit, t('explore.rankingBaseline'));
    if (details) {
      byHit.set(hit, details);
    }
  }
  return byHit;
});

function rankingFor(hit: SearchHit): RankingDetails | null {
  return rankingByHit.value.get(hit) ?? null;
}

const estateNodes = computed(() => buildEstateTree(estateFacets.value, estateChildMap.value));
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
  const from = page.value * pageSize.value + 1;
  return { from, to: Math.min(total.value, from + hits.value.length - 1) };
});
/** D29 (ExploreV1.component.tsx:676-687): the displayed page, clamped into [1, totalPages]. */
const totalPages = computed(() => Math.max(Math.ceil(total.value / pageSize.value), 1));
const validPage = computed(() => Math.min(Math.max(page.value, 0), totalPages.value - 1));
/**
 * D34 (SearchedData.tsx:92-117, ExploreV1.component.tsx:515,706-709):
 * the "N results" badge shows only when something is applied — a text
 * query, a chip filter, or a saved query_filter — never on the bare
 * unfiltered browse.
 */
const showResultCount = computed(() =>
  Boolean(query.value.trim() || hasActiveFilters(filters.value) || queryFilter.value),
);
const resultCountText = computed(() => {
  if (total.value === 1) {
    return t('explore.resultOne');
  }
  if (total.value === MAX_RESULT_HITS) {
    return t('explore.resultsCapped', { total: total.value });
  }
  return t('explore.results', { total: total.value });
});

/** Official ExploreV1.component.tsx:709-744, export derived values. */
const isSearchMode = computed(() => query.value.trim().length > 0);
const pageResultCount = computed(() => hits.value.length);
const visibleResultCount = computed(() =>
  isSearchMode.value ? (tabAssetsCount.value ?? 0) : pageResultCount.value,
);
const isAllAssetsLimitExceeded = computed(
  () =>
    exportScope.value === 'all' &&
    allAssetsCount.value !== undefined &&
    allAssetsCount.value > EXPORT_ALL_ASSETS_LIMIT,
);
const isTabScopeDisabled = computed(
  () =>
    isSearchMode.value &&
    exportScope.value === 'visible' &&
    !isCountLoading.value &&
    !tabAssetsCount.value,
);
const activeTabLabel = computed(() =>
  effectiveTab.value ? t(`explore.entity.${effectiveTab.value.labelKey}`) : t('explore.exportVisibleResults'),
);

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function usagePercentileText(hit: SearchHit): string {
  return getUsagePercentile(
    hit.usageSummary?.weeklyStats?.percentileRank ?? 0,
    true,
    (key) => t(key),
  );
}

function facetTitle(id: FacetId): string {
  return t(`explore.facets.${id}`);
}

function activeFilterLabel(id: FacetId, value: string): string {
  if (value === NULL_OPTION_KEY) {
    return t('explore.noEntity', { entity: facetTitle(id) });
  }
  const display = id === 'entityType' ? entityLabel(value) : value;
  return `${facetTitle(id)}: ${display}`;
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
  nextOptions: { showDeleted?: boolean; pageSize?: number; queryFilter?: string | null } = {},
): void {
  const next: Record<string, string> = { ...filtersToQuery(nextFilters) };
  const trimmed = nextQuery.trim();
  if (trimmed) {
    next.q = trimmed;
  }
  // The advanced-search filter lives in `query_filter` (pin `queryFilter`
  // URL param); it survives tab/sort/page navigation unless the caller
  // explicitly sets (string) or clears (null) it.
  const nextQueryFilter = nextOptions.queryFilter === undefined ? queryFilter.value : nextOptions.queryFilter;
  if (nextQueryFilter) {
    next.query_filter = nextQueryFilter;
  }
  if (nextPage > 0) {
    next.page = String(nextPage);
  }
  const nextShowDeleted = nextOptions.showDeleted ?? showDeleted.value;
  if (nextShowDeleted) {
    next.showDeleted = 'true';
  }
  const nextPageSize = nextOptions.pageSize ?? pageSize.value;
  if (nextPageSize !== DEFAULT_EXPLORE_PAGE_SIZE) {
    next.pageSize = String(nextPageSize);
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
  // The tab travels as the `/explore/:tab` path param (pin
  // `ROUTES.EXPLORE_WITH_TAB`), not as a query param; no tab means no
  // param, exactly as pin navigates with an empty tab.
  void router.push({
    name: 'search',
    params: nextTab ? { tab: nextTab.slug } : {},
    query: next,
  });
}

function onChipChange(id: FacetId, values: string[]): void {
  const next: SearchFilters = { ...filters.value, [id]: values };
  if (!values.length) {
    delete next[id];
  }
  const estate = id === 'entityType' ? selectedEstateFromFilters(next) : estateFromQuery(route.query);
  pushSearch(query.value, next, 0, currentSort.value, estate);
}

function onChipOpen(id: FacetId, open: boolean): void {
  if (open) {
    void facetOptions.loadOptions(id);
  } else {
    // A keystroke still pending when its dropdown closes would start a
    // newer request than the next dropdown's initial fetch (pin
    // ExploreQuickFilters onOpenChange).
    facetOptions.cancelSearch();
  }
}

function onChipSearch(id: FacetId, text: string): void {
  facetOptions.searchOptions(id, text);
}

function onToggleFacet(id: FacetId, value: string): void {
  const current = filters.value[id] ?? [];
  const nextValues = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  onChipChange(id, nextValues);
}

function onClearFilters(): void {
  // Pin `onResetAllFilters`: clearing filters also clears the advanced filter.
  pushSearch(query.value, {}, 0, currentSort.value, '', activeTab.value, { queryFilter: null });
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
  // D30 (ExplorePageV1.component.tsx:211-230, handleSearchIndexChange):
  // only the common owner + tag filters carry over (explore.constants
  // COMMON_FILTERS_FOR_DIFFERENT_TABS); with a query the sort resets to
  // _score, otherwise to the new tab's default; the page returns to 1
  // and the order resets to the new tab's default. The estate drill is
  // a filter too, so it does not survive the switch either — official's
  // tree selection lives in the quick filter, which is dropped the
  // same way.
  const carried: SearchFilters = {};
  if (filters.value.owner?.length) {
    carried.owner = filters.value.owner;
  }
  if (filters.value.tagFqn?.length) {
    carried.tagFqn = filters.value.tagFqn;
  }
  const fallback = tab ? defaultSortForTab(tab) : { id: DEFAULT_SORT.id, defaultOrder: DEFAULT_SORT.order };
  const sort = query.value.trim()
    ? { id: 'relevance', order: 'desc' as const }
    : { id: fallback.id, order: fallback.defaultOrder };
  pushSearch(query.value, carried, 0, sort, '', tab);
}

function onShowDeletedChange(value: boolean): void {
  pushSearch(query.value, filters.value, 0, currentSort.value, estateFromQuery(route.query), activeTab.value, {
    showDeleted: value,
  });
}

function onToggleRankingDetails(): void {
  // Flipping the toggle refires the search (it is part of searchKey) with
  // `explain` on or off; pin's Tools item does the same state flip.
  showRankingDetails.value = !showRankingDetails.value;
}

function onPageSizeChange(_current: number, size: number): void {
  const nextSize = pageSizeFromQuery(size, readGlobalPageSize(window.localStorage, authStore.user?.name));
  writeGlobalPageSize(window.localStorage, authStore.user?.name, nextSize);
  pushSearch(query.value, filters.value, 0, currentSort.value, estateFromQuery(route.query), activeTab.value, {
    pageSize: nextSize,
  });
}

function freshAdvancedTree(fields: QueryBuilderFieldDef[]): QueryGroup {
  const field = findFieldDef(fields, 'ownerDisplayName') ?? fields[0];
  return field
    ? { kind: 'group', conjunction: 'AND', children: [createQueryRule(field)] }
    : emptyQueryGroup();
}

function openAdvancedSearch(): void {
  // The free text is the Lucene `q` as-is: advanced clauses now live in
  // `query_filter`, not in `q` (the old flat rows parsed them out of `q`).
  advancedFreeText.value = query.value;
  // Reopen the applied filter for editing when it parses against this
  // tab's fields (pin `QbUtils.loadTree` + `isValidTree`); an unparseable
  // filter (e.g. a saved filter with an unknown shape) starts a fresh
  // tree instead of being rewritten — Cancel keeps the URL untouched.
  const parsed = queryFilter.value
    ? parseElasticsearchQuery(queryFilter.value, advancedFieldDefs.value)
    : null;
  advancedTree.value = parsed ?? freshAdvancedTree(advancedFieldDefs.value);
  void advancedFields.loadCustomPropertyFields();
  advancedOpen.value = true;
}

function resetAdvancedSearch(): void {
  advancedTree.value = freshAdvancedTree(advancedFieldDefs.value);
}

function applyAdvancedSearch(): void {
  if (!advancedCanApply.value) {
    return;
  }
  const filter = buildQueryFilter(advancedTree.value, advancedFieldDefs.value);
  advancedOpen.value = false;
  pushSearch(advancedFreeText.value, filters.value, 0, currentSort.value, estateFromQuery(route.query), activeTab.value, {
    queryFilter: filter ?? null,
  });
}

/** Pin `onResetQueryFilter`: clears only the advanced filter, keeping `q` and the quick filters. */
function clearAdvancedSearch(): void {
  pushSearch(query.value, filters.value, 0, currentSort.value, estateFromQuery(route.query), activeTab.value, {
    queryFilter: null,
  });
}

function handleExportScopeChange(scope: ExportScope): void {
  exportScope.value = scope;
  exportError.value = '';
}

function closeExportScopeModal(): void {
  showExportScopeModal.value = false;
  exportError.value = '';
}

/**
 * Official ExploreV1.component.tsx:746-795 (handleOpenExportScopeModal):
 * counts come from ONE size-0 query over the dataAsset index with
 * trackTotalHits (so the 200000 limit check sees the true total, not
 * the 10000 ES cap); the tab count is the entityType-aggregation bucket
 * for the active tab. Pin has no all-tab, so its lookup has no all-tab
 * case — the product all-tab IS the dataAsset index, so its visible
 * count is the all-assets count. A failed count leaves the modal usable
 * without counts, exactly as pin's swallowed catch does.
 */
async function handleOpenExportScopeModal(): Promise<void> {
  toolsOpen.value = false;
  exportScope.value = 'all';
  allAssetsCount.value = undefined;
  tabAssetsCount.value = undefined;
  exportError.value = '';
  showExportScopeModal.value = true;
  isCountLoading.value = true;
  try {
    const countResult = await searchAssets(composeSearchQuery(query.value, filters.value), 0, 0, {
      deleted: showDeleted.value,
      trackTotalHits: true,
      query_filter: queryFilter.value,
    });
    allAssetsCount.value = countResult.total;
    if (isSearchMode.value) {
      tabAssetsCount.value = effectiveTab.value
        ? (countResult.facets
            .find((facet) => facet.id === 'entityType')
            ?.buckets.find((bucket) => bucket.key === effectiveTab.value?.entityType)?.count ?? 0)
        : countResult.total;
    }
  } catch {
    // Count fetch failed — modal still usable without count.
  } finally {
    isCountLoading.value = false;
  }
}

/**
 * Official ExploreV1.component.tsx:797-870 (handleExportScopeConfirm):
 * `from` is sent only for the visible scope in browse mode (no search
 * query); in search mode the visible scope exports the tab's first N.
 * On success the job is claimed into the CSV jobs tray
 * (markCsvJobOwned + refresh event, the product equivalents of pin's
 * window event dispatch) and a success toast shows; on failure the
 * modal stays open with the inline error.
 */
async function handleExportScopeConfirm(): Promise<void> {
  if (isAllAssetsLimitExceeded.value) {
    return;
  }
  const isVisibleScope = exportScope.value === 'visible';
  const exportSize = isVisibleScope
    ? visibleResultCount.value
    : (allAssetsCount.value ?? EXPORT_ALL_ASSETS_LIMIT);
  const exportFrom =
    isVisibleScope && !isSearchMode.value ? page.value * pageSize.value : undefined;
  exportError.value = '';
  isExporting.value = true;
  try {
    const job = await exportSearchResultsAsync({
      q: composeSearchQuery(query.value, filters.value),
      index: isVisibleScope ? (effectiveTab.value?.index ?? 'dataAsset') : 'dataAsset',
      sort_field: currentSort.value.field,
      sort_order: currentSort.value.order,
      size: exportSize,
      ...(exportFrom !== undefined ? { from: exportFrom } : {}),
      deleted: showDeleted.value,
      ...(queryFilter.value ? { query_filter: queryFilter.value } : {}),
    });
    markCsvJobOwned(job.jobId);
    notifyCsvJobsRefresh();
    message.success(t('explore.exportJobStarted'));
    showExportScopeModal.value = false;
  } catch (error) {
    exportError.value =
      error instanceof ApiError ? readErrorMessage(error.body, error.status) : t('explore.failed');
  } finally {
    isExporting.value = false;
  }
}

function onEstateSelect(node: EstateNode): void {
  pushSearch(query.value, filtersForEstateNode(node, filters.value), 0, currentSort.value, node.categoryId);
}

function onEstateExpand(keys: string[]): void {
  expandedKeys.value = keys;
}

function selectHit(hit: SearchHit): void {
  selectedFqn.value = hit.fullyQualifiedName || hit.name;
}

// Non-null parent-table location for the card's Table link. Only called
// under the parentTableLocation(...) v-if guard, so the throw is unreachable
// in practice; it exists because templates have no non-null assertion.
function parentTableTo(hit: SearchHit): { name: string; params: { entityType: string; fqn: string } } {
  const location = parentTableLocation(hit.entityType, hit.tableFqn);
  if (!location) {
    throw new Error('parentTableTo called without a parent table FQN');
  }
  return location;
}

/**
 * Hover/focus prefetch (D24). Pin `ExploreSearchCard` `handlePrefetch`
 * warms the detail cache for table / dashboard / pipeline / topic on
 * the name link's mouseenter + focus, so the click that follows hits a
 * populated slot; other types are no-ops. The warmed slot is the
 * `prefetchAssetDetail` cache consulted by `fetchAssetDetail`.
 */
function prefetchHit(hit: SearchHit): void {
  if (shouldPrefetchCard(hit.entityType) && hit.fullyQualifiedName) {
    prefetchAssetDetail(hit.entityType, hit.fullyQualifiedName);
  }
}

function openHit(hit: SearchHit): void {
  // D26: parent table, wired asset detail, or governance detail for
  // glossaryTerm / tag / dataProduct (when the hit carries an id).
  // Anything without a navigation target only selects the preview.
  if (!openSearchHit((to) => void router.push(to), hit)) {
    selectHit(hit);
  }
}

// D25: the preview lineage entry navigates to the lineage page for the
// hit (product analogue of pin EntitySummaryPanel handleLineageClick).
function openLineageHit(hit: SearchHit): void {
  if (hit.fullyQualifiedName) {
    void router.push(lineageLocation(hit.entityType, hit.fullyQualifiedName));
  }
}

function hitKey(hit: SearchHit, index: number): string {
  return hit.fullyQualifiedName || hit.id || `${hit.entityType}-${index}`;
}

function isSelected(hit: SearchHit): boolean {
  const key = hit.fullyQualifiedName || hit.name;
  return selectedHit.value ? (selectedHit.value.fullyQualifiedName || selectedHit.value.name) === key : false;
}

async function loadEstatePresence(): Promise<void> {
  try {
    const pageResult = await exploreCache.getOrLoad(
      JSON.stringify({ estatePresence: query.value.trim() || '*', deleted: showDeleted.value }),
      () => searchAssets(query.value.trim() || '*', 0, 0, { deleted: showDeleted.value }),
    );
    estateFacets.value = pageResult.facets;
  } catch {
    estateFacets.value = [];
  }
}

/**
 * D4: per-tab counts for the current query from GET
 * /v1/search/entityTypeCounts (ExploreUtils.ts:209-235), over every
 * Explore tab index with the chip filters folded into the Lucene `q`
 * and the saved `query_filter` passed through. The 30s SWR cache
 * shares the request across tab switches within the session. A slow
 * response for a superseded query never overwrites the current
 * query's counts; a failed counts call leaves the aggregation counts
 * in place (tabs are never hidden on partial counts). Returns the top
 * hit's entity type (pin `applyHitCounts` reads `hits[0]` for the
 * auto-select tie-breaker) — undefined when the response carries no
 * hit or the counts belong to a superseded query.
 */
async function loadTypeCounts(): Promise<string | undefined> {
  const key = countsKey.value;
  const page = await exploreCache.getOrLoad(
    `counts:${key}`,
    () =>
      searchEntityTypeCounts({
        query: composeSearchQuery(query.value, filters.value),
        index: EXPLORE_TABS.map((tab) => tab.index),
        queryFilter: queryFilter.value,
        deleted: showDeleted.value,
        includeTopHit: !activeTab.value,
      }),
  );
  if (key === countsKey.value) {
    typeCounts.value = entityTypeCountsFromPage(page);
    typeCountsKey.value = key;
    return page.hits[0]?.entityType;
  }
  return undefined;
}

/**
 * D17 (ExplorePageV1.component.tsx:645-671): the sharded tables the
 * query names, shown as "Matching sharded families". Runs beside the
 * results search, never blocking it; a superseded query's result is
 * dropped, and a failed lookup clears the section.
 */
async function loadShardedFamilies(): Promise<void> {
  const trimmed = query.value.trim();
  try {
    const families = await exploreCache.getOrLoad(
      `sharded:${JSON.stringify({ q: trimmed, queryFilter: queryFilter.value, deleted: showDeleted.value })}`,
      () =>
        findShardedFamilies(trimmed, {
          queryFilter: queryFilter.value,
          includeDeleted: showDeleted.value,
          searchTables: async (filter) => {
            const page = await searchAssets('', 0, 10, {
              index: 'table',
              includeAggregations: false,
              query_filter: filter,
            });
            return page.hits;
          },
          fetchTable: async (fqn) => {
            try {
              return await getTableShardingByName(fqn);
            } catch {
              return undefined;
            }
          },
        }),
    );
    if (trimmed === query.value.trim()) {
      shardedFamilies.value = families;
    }
  } catch {
    if (trimmed === query.value.trim()) {
      shardedFamilies.value = [];
    }
  }
}

/**
 * Lazy-loads one tree node's next level, for any expandable node, not just
 * the selected estate. A failed load leaves the node unloaded (still
 * expandable, so collapsing and re-expanding retries) rather than turning
 * the failure into a misleading leaf.
 */
async function loadEstateChildren(node: EstateNode): Promise<void> {
  const drill = estateDrill(node);
  if (!drill || estateLoadingKeys.value.has(node.key)) {
    return;
  }
  estateLoadingKeys.value.add(node.key);
  try {
    const pageResult = await searchAssets(composeSearchQuery(query.value, drill.filters), 0, 0, {
      deleted: showDeleted.value,
    });
    const buckets = pageResult.facets.find((facet) => facet.id === drill.facet)?.buckets ?? [];
    estateChildMap.value = { ...estateChildMap.value, [node.key]: estateChildNodes(node, buckets) };
  } catch {
    // Leave the node unloaded; see the comment above.
  } finally {
    estateLoadingKeys.value.delete(node.key);
  }
}

async function runSearch(): Promise<void> {
  // A new search invalidates the per-facet chip overrides fetched for
  // the previous context; the context-keyed options cache survives.
  facetOptions.reset();
  loading.value = true;
  errorMessage.value = '';
  indexNotFound.value = false;
  try {
    const estatePromise = loadEstatePresence();
    // A new search rebuilds the tree and drops previously loaded children,
    // matching the official tree's rebuild behaviour.
    estateChildMap.value = {};
    const trimmedQuery = query.value.trim();
    // D11 NLQ (pin ExploreUtils.fetchEntityData): NLP active + a
    // non-empty query goes through nlqSearch instead of the keyword
    // search. The query is the raw text (pin sends the escaped query
    // plus the combined query_filter separately); the chip filters are
    // the product's Lucene transport and are not composed into an NLQ
    // call. The /hybrid route pin's UI calls is not reproduced: no
    // /hybrid route exists in the pin server or this server (B2-S1
    // verdict) — GET /v1/search/nlq/query is the route both serve.
    const useNlq =
      searchStore.isNLPActive && searchStore.isNLPEnabled && trimmedQuery !== '';
    // D4 + D17: official runs counts and results concurrently when a
    // tab is explicit (ExploreUtils.ts:349-359), and the sharded-family
    // lookup is its own effect (ExplorePageV1.component.tsx:645-671).
    // A failed counts call must not fail the results (see D3 hiding).
    // With a query and NO tab, the count decides which index actually
    // has results, so the count must complete before the results query
    // can be issued: pin auto-selects via findActiveSearchIndex and
    // falls back to dataAsset when no tab has hits
    // (ExploreUtils.ts:370-378). The auto-selected tab is state, not
    // URL — the URL stays `/explore`.
    let countsPromise: Promise<string | undefined>;
    if (trimmedQuery && !activeTab.value) {
      countsPromise = loadTypeCounts().catch(() => undefined);
      const topHit = await countsPromise;
      autoSelectedTab.value = findActiveSearchIndex(
        countsForCurrentQuery.value ?? new Map(),
        useNlq ? undefined : topHit,
      );
    } else {
      autoSelectedTab.value = null;
      countsPromise = trimmedQuery ? loadTypeCounts().catch(() => undefined) : Promise.resolve(undefined);
    }
    if (trimmedQuery) {
      void loadShardedFamilies();
    } else {
      shardedFamilies.value = [];
    }
    const index = effectiveTab.value?.index ?? 'dataAsset';
    // D31/D29/D32: the keyword search goes through the 30s cache, keyed
    // by the exact request (the ranking-details explain flag is part of
    // the key, so toggling it is never served a stale cached result);
    // the request uses the clamped page (D29), and sends
    // track_total_hits, explain and exclude_source_fields
    // (ExploreUtils.ts:191-193,314-319). NLQ stays a direct call: it is
    // a different endpoint and is not part of the results cache.
    const searchParams = {
      q: composeSearchQuery(query.value, filters.value),
      from: validPage.value * pageSize.value,
      size: pageSize.value,
      index,
      sortField: currentSort.value.field,
      sortOrder: currentSort.value.order,
      deleted: showDeleted.value,
      explain: showRankingDetails.value,
      queryFilter: effectiveQueryFilter.value,
    };
    const pageResult = useNlq
      ? await nlqSearch(query.value.trim(), searchParams.from, pageSize.value, {
          index,
          sortField: currentSort.value.field,
          sortOrder: currentSort.value.order,
          deleted: showDeleted.value,
          explain: showRankingDetails.value,
          query_filter: effectiveQueryFilter.value,
        })
      : await exploreCache.getOrLoad(JSON.stringify(searchParams), () =>
          searchAssets(searchParams.q, searchParams.from, searchParams.size, {
            index: searchParams.index,
            sortField: searchParams.sortField,
            sortOrder: searchParams.sortOrder,
            deleted: searchParams.deleted,
            explain: searchParams.explain,
            query_filter: searchParams.queryFilter,
            trackTotalHits: true,
            excludeSourceFields: [...SEARCH_EXCLUDE_SOURCE_FIELDS],
          }),
        );
    hits.value = pageResult.hits;
    total.value = pageResult.total;
    facets.value = pageResult.facets;
    // D11 echo: surface the backend-detected filters pin's
    // onNlqAppliedFilters hands to the Explore filters. Absent on
    // keyword searches and on NLQ searches that detected none.
    nlqAppliedFilters.value = pageResult.appliedQuickFilters?.fieldList ?? [];
    await countsPromise;
    if (estateId.value) {
      expandedKeys.value = [estateId.value];
      await Promise.all([
        estatePromise,
        loadEstateChildren({ key: estateId.value, categoryId: estateId.value, titleKey: '', count: 0 }),
      ]);
    } else {
      await estatePromise;
    }
    if (hits.value.length && !hits.value.some((hit) => (hit.fullyQualifiedName || hit.name) === selectedFqn.value)) {
      selectedFqn.value = hits.value[0].fullyQualifiedName || hits.value[0].name;
    }
    // D29: once results settle, correct an out-of-range page in the URL,
    // as official's ExploreV1 effect navigates to validCurrentPage
    // (ExploreV1.component.tsx:924-941). The re-run this triggers reads
    // the same clamped page from the D31 cache.
    if (page.value !== validPage.value) {
      const nextQuery = { ...route.query };
      if (validPage.value > 0) {
        nextQuery.page = String(validPage.value);
      } else {
        delete nextQuery.page;
      }
      await router.replace({ name: 'search', params: route.params, query: nextQuery });
    }
  } catch (error) {
    hits.value = [];
    total.value = 0;
    facets.value = [];
    nlqAppliedFilters.value = [];
    const message = error instanceof Error ? error.message : t('explore.failed');
    errorMessage.value = message;
    indexNotFound.value = isIndexNotFoundError(message);
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
  // Official lazy-load rule: every expanded node whose children are still
  // unknown gets loaded, not just the selected estate's category.
  for (const key of keys) {
    const node = findEstateNode(estateNodes.value, key);
    if (node && !node.isLeaf && node.children === undefined) {
      void loadEstateChildren(node);
    }
  }
});
</script>

<template>
  <div class="explore" data-tour-step="explore-search" data-tour-page>
    <PageHeader :header="t('explore.title')" :sub-header="query ? t('explore.leadQuery', { query }) : t('explore.lead')" />
    <div class="explore__toolbar">
      <ExploreFilterChips
        :facets="chipFacets"
        :filters="filters"
        :facet-ids="chipFacetIds"
        :searching-facet-ids="facetOptions.searchingFacets.value"
        @change="onChipChange"
        @open="onChipOpen"
        @search="onChipSearch"
      />
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
        <span class="explore__show-deleted">
          <Switch
            data-testid="explore-show-deleted"
            size="small"
            :checked="showDeleted"
            :aria-label="t('explore.showDeleted')"
            @change="onShowDeletedChange"
          />
          {{ t('explore.showDeleted') }}
        </span>
        <Button
          size="small"
          data-testid="explore-advanced-search"
          :aria-label="t('explore.advancedSearch')"
          @click="openAdvancedSearch"
        >
          {{ t('explore.advancedSearch') }}
        </Button>
        <Dropdown v-model:open="toolsOpen" :trigger="['click']" data-testid="explore-tools">
          <Button
            size="small"
            data-testid="explore-tools-trigger"
            :aria-label="t('explore.tools')"
          >
            {{ t('explore.tools') }}
          </Button>
          <template #overlay>
            <Menu :selectable="false" data-testid="explore-tools-menu">
              <Menu.Item
                key="ranking-details"
                data-testid="explore-ranking-details"
                @click="onToggleRankingDetails"
              >
                <span class="explore__tools-item">
                  {{ t('explore.rankingDetails') }}
                  <Switch
                    size="small"
                    :checked="showRankingDetails"
                    class="explore__tools-switch"
                    :aria-label="t('explore.rankingDetails')"
                  />
                </span>
              </Menu.Item>
              <Menu.Item
                key="export"
                data-testid="explore-export"
                @click="handleOpenExportScopeModal"
              >
                <span class="explore__tools-item">
                  {{ t('explore.export') }}
                </span>
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
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
    <Typography.Text
      v-if="nlqAppliedFilters.length"
      type="secondary"
      class="explore__nlq-filters"
      data-testid="explore-nlq-applied-filters"
    >
      {{ t('explore.nlqAppliedFilters', { fields: nlqAppliedFilters.join(', ') }) }}
    </Typography.Text>
    <Space v-if="hasActiveFilters(filters)" wrap class="explore__active">
      <template v-for="id in activeFilterIds" :key="id">
        <Tag
          v-for="value in filters[id] ?? []"
          :key="`${id}:${value}`"
          closable
          :data-testid="`search-active-${id}-${value}`"
          @close="onToggleFacet(id, value)"
        >
          {{ activeFilterLabel(id, value) }}
        </Tag>
      </template>
    </Space>
    <div v-if="advancedSql" class="explore__applied-filter" data-testid="advance-search-filter-container">
      <Typography.Text type="secondary">{{ t('explore.advancedSearch') }}</Typography.Text>
      <span class="explore__applied-filter-text" data-testid="advance-search-filter-text">{{ advancedSql }}</span>
      <Button
        size="small"
        data-testid="advance-search-filter-btn"
        :aria-label="t('explore.advancedEdit')"
        @click="openAdvancedSearch"
      >
        {{ t('explore.advancedEdit') }}
      </Button>
      <Button
        size="small"
        data-testid="advance-search-clear-btn"
        :aria-label="t('explore.advancedClear')"
        @click="clearAdvancedSearch"
      >
        {{ t('explore.advancedClear') }}
      </Button>
    </div>
    <!-- D35 (pin ExploreV1:413): the active-domain chip sits directly under
         the filter-chips row. It renders nothing without an active domain. -->
    <DomainFilterChip class="explore__domain-chip" />
    <div class="explore__split">
      <aside class="explore__pane explore__pane--estate">
        <!-- D14 (pin ExploreV1 exploreLeftPanel): a query turns the left
             aside into the vertical tab list; without one it is the tree. -->
        <nav
          v-if="query"
          class="explore__left-panel"
          data-testid="explore-left-panel"
          :aria-label="t('explore.browseEstate')"
        >
          <button
            v-for="item in leftPanelItems"
            :key="item.key"
            type="button"
            class="explore__left-tab"
            :class="{ 'explore__left-tab--active': effectiveTab?.index === item.key }"
            :data-testid="`explore-left-tab-${item.key}`"
            @click="onTabChange(item.key)"
          >
            <SearchEntityIcon :entity-type="item.iconType" :size="16" />
            <span class="explore__left-label">{{ item.label }}</span>
            <span v-if="item.count !== undefined" class="explore__left-count" data-testid="filter-count">
              {{ item.count }}
            </span>
          </button>
        </nav>
        <ExploreEstateTree
          v-else
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
        <Alert
          v-if="indexNotFound"
          type="error"
          show-icon
          closable
          data-testid="explore-index-not-found"
          :message="t('explore.indexNotFoundTitle')"
          class="explore__error"
          @close="indexNotFound = false"
        >
          <template #description>
            {{ t('explore.indexNotFoundMessage') }}
            <router-link :to="{ name: 'settings-preferences-search' }">{{ t('explore.indexNotFoundSettings') }}</router-link>
          </template>
        </Alert>
        <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="explore__error" />
        <div
          v-if="shardedFamilies.length"
          class="explore__sharded"
          data-testid="explore-sharded-families"
          :aria-label="t('explore.matchingShardedFamilies')"
        >
          <Typography.Text strong>{{ t('explore.matchingShardedFamilies') }}</Typography.Text>
          <div class="explore__sharded-links">
            <router-link
              v-for="table in shardedFamilies"
              :key="table.id"
              :to="assetLocation('table', table.fullyQualifiedName)"
              data-testid="explore-sharded-family"
            >
              {{ table.fullyQualifiedName }}
            </router-link>
          </div>
        </div>
        <div data-testid="search-results" class="explore__results">
          <Empty
            v-if="!loading && !hits.length && !errorMessage"
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
            <!-- D18: clickable entity breadcrumbs replace the raw FQN row
                 (pin `ExploreSearchCard` `BreadcrumbAndScoreCell`). -->
            <SmBreadcrumb
              v-if="cardBreadcrumbs(hit).length"
              :items="cardBreadcrumbs(hit)"
              :test-id="`explore-card-breadcrumbs-${hit.fullyQualifiedName || hit.name}`"
              class="explore__card-crumbs"
            />
            <div class="explore__card-head">
              <!-- D22: the entity icon, not a type Tag chip. -->
              <component :is="entityIconFor(hit.entityType)" class="explore__card-icon" />
              <!-- Column titles are plain text in the official card (its
                   column link resolves to ''), so they are not anchors here
                   either; the parent-table link below is the navigation. -->
              <span v-if="hit.entityType === 'tableColumn'" class="explore__card-name">
                <HighlightedText :text="cardDisplayName(hit)" :search-terms="cardNameNeedles(hit)" />
              </span>
              <a
                v-else
                href="#"
                class="explore__card-name"
                @click.prevent.stop="openHit(hit)"
                @mouseenter="prefetchHit(hit)"
                @focus="prefetchHit(hit)"
              >
                <HighlightedText :text="cardDisplayName(hit)" :search-terms="cardNameNeedles(hit)" />
              </a>
              <Typography.Text v-if="!detailLocationForHit(hit)" type="secondary">
                {{ t('explore.unwired') }}
              </Typography.Text>
            </div>
            <!-- Two-line clamp is CSS here, not antd `ellipsis`: the
                 antd ellipsis prop only truncates a `content` string and
                 warns (without truncating) when children are slotted in,
                 and the highlighted description must render as children. -->
            <p class="explore__desc">
              <HighlightedText
                :text="hit.description || t('explore.noDescription')"
                :search-terms="cardDescriptionNeedles(hit)"
              />
            </p>
            <div class="explore__meta">
              <!-- The breadcrumbs above already carry service / database /
                   schema; the location text stays only for types without
                   a breadcrumb trail. -->
              <Typography.Text v-if="!cardBreadcrumbs(hit).length" type="secondary">
                {{ hitLocation(hit) || t('explore.locationMissing') }}
              </Typography.Text>
              <Typography.Text v-if="hit.serviceType" type="secondary">{{ hit.serviceType }}</Typography.Text>
              <Typography.Text v-if="hit.tier" type="secondary">{{ hit.tier }}</Typography.Text>
              <!-- Pin explore card: the literal "Usage Nth pctile" form
                   shows whenever the hit carries the usageSummary key,
                   with a missing rank falling back to 0. -->
              <Typography.Text v-if="hit.usageSummary" type="secondary" data-testid="explore-card-usage-percentile">
                {{ usagePercentileText(hit) }}
              </Typography.Text>
              <router-link
                v-if="parentTableLocation(hit.entityType, hit.tableFqn)"
                :to="parentTableTo(hit)"
                data-testid="explore-card-parent-table"
                @click.stop
              >
                {{ hit.tableName || hit.tableFqn }}
              </router-link>
            </div>
            <!-- D20: Matches section — hit fields except `.ngram` and the
                 name fields (pin `SearchedData.tsx` + `MatchesSection`). -->
            <div
              v-if="cardMatches(hit.highlight).length"
              class="explore__matches"
              :data-testid="`explore-card-matches-${hit.fullyQualifiedName || hit.name}`"
            >
              <Typography.Text type="secondary">{{ t('explore.matches') }}:</Typography.Text>
              <Typography.Text
                v-for="(match, matchIndex) in cardMatches(hit.highlight)"
                :key="match.key"
                type="secondary"
              >
                {{ t('explore.matchIn', { count: match.value, field: match.label })
                }}{{ matchIndex < cardMatches(hit.highlight).length - 1 ? ',' : '' }}
              </Typography.Text>
            </div>
            <Space wrap>
              <Typography.Text v-if="!hit.owners.length" type="secondary">{{ t('explore.noOwners') }}</Typography.Text>
              <!-- D23: owner avatars, not plain-text names (pin `Owner`
                   `avatarSize={24}`); the name survives as the hover title. -->
              <SmProfilePicture
                v-for="owner in hit.owners"
                :key="owner.name"
                :name="owner.name"
                :display-name="owner.displayName"
                :is-team="owner.type === 'team'"
                size="xs"
                :title="owner.displayName || owner.name"
              />
            </Space>
            <ExploreRankingDetails :details="rankingFor(hit)" />
          </article>
        </div>
        <div v-if="!loading && !errorMessage" class="explore__footer">
          <Typography.Text type="secondary">
            {{
              total
                ? t('explore.records', { from: recordRange.from, to: recordRange.to, total })
                : t('explore.shown', { shown: hits.length })
            }}
          </Typography.Text>
          <Typography.Text v-if="showResultCount" type="secondary" data-testid="search-results-count">
            {{ resultCountText }}
          </Typography.Text>
          <Pagination
            v-if="total > 0"
            data-testid="search-pagination"
            size="small"
            :current="validPage + 1"
            :page-size="pageSize"
            :page-size-options="EXPLORE_PAGE_SIZE_OPTIONS.map(String)"
            :total="total"
            :show-size-changer="true"
            @change="onPageChange"
            @show-size-change="onPageSizeChange"
          />
        </div>
      </section>
      <aside class="explore__pane explore__pane--preview">
        <ExplorePreview :hit="selectedHit" @open="openHit" @open-lineage="openLineageHit" />
      </aside>
    </div>
    <ExploreExportScopeModal
      :open="showExportScopeModal"
      :export-scope="exportScope"
      :is-search-mode="isSearchMode"
      :is-count-loading="isCountLoading"
      :tab-assets-count="tabAssetsCount"
      :page-result-count="pageResultCount"
      :all-assets-count="allAssetsCount"
      :active-tab-label="activeTabLabel"
      :is-exporting="isExporting"
      :is-all-assets-limit-exceeded="isAllAssetsLimitExceeded"
      :is-tab-scope-disabled="isTabScopeDisabled"
      :export-error="exportError || undefined"
      @update:export-scope="handleExportScopeChange"
      @cancel="closeExportScopeModal"
      @ok="handleExportScopeConfirm"
    />
    <FormModal
      :open="advancedOpen"
      :title="t('explore.advancedSearch')"
      size="xl"
      :ok-text="t('explore.advancedApply')"
      :ok-disabled="!advancedCanApply"
      test-id="advanced-search-modal"
      @ok="applyAdvancedSearch"
      @cancel="advancedOpen = false"
      @update:open="advancedOpen = $event"
    >
      <Space direction="vertical" style="width: 100%">
        <Input
          data-testid="advanced-search-free-text"
          :value="advancedFreeText"
          :aria-label="t('explore.advancedFreeText')"
          :placeholder="t('explore.advancedFreeText')"
          @update:value="advancedFreeText = $event"
        />
        <AdvancedSearchBuilder
          v-model="advancedTree"
          :fields="advancedFieldDefs"
          :fetch-options="
            (field, text) =>
              advancedFields.fetchFieldOptions(field, text, effectiveTab?.index ?? 'dataAsset')
          "
        />
        <Space>
          <Button size="small" data-testid="advanced-search-reset" @click="resetAdvancedSearch">
            {{ t('explore.advancedReset') }}
          </Button>
        </Space>
        <Typography.Text v-if="!advancedCanApply" type="warning">
          {{ t('explore.advancedIncomplete') }}
        </Typography.Text>
      </Space>
    </FormModal>
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
.explore__show-deleted {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
}
/* E2's applied-filter SQL text row (kept) + E4's Tools menu / old advanced-row
   rules (kept; .explore__advanced-row is currently unused — E2 replaced the
   old rows UI with AdvancedSearchBuilder — retained to preserve E4's diff). */
.explore__applied-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  padding: 6px 10px;
  font-size: 13px;
}
.explore__tools-item {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.explore__tools-switch {
  /* Pin's Tools toggle is read-only with pointer-events none: the menu
     row is the single toggle path, so the switch never double-fires. */
  pointer-events: none;
}
.explore__advanced-row {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.explore__applied-filter-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--sm-text-primary);
}
.explore__active {
  margin-bottom: 0;
}
.explore__nlq-filters {
  font-size: 12px;
}
.explore__domain-chip {
  margin-top: 8px;
}
.explore__left-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.explore__left-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: var(--sm-border-radius);
  background: transparent;
  color: var(--sm-text-primary);
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
}
.explore__left-tab:hover {
  background: var(--sm-bg-elevated);
}
.explore__left-tab--active {
  border-color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
  color: var(--sm-color-primary);
}
.explore__left-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.explore__left-count {
  flex-shrink: 0;
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--sm-bg-elevated);
  color: var(--sm-text-tertiary);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.explore__left-tab--active .explore__left-count {
  background: var(--sm-color-primary);
  color: var(--sm-bg-container);
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
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
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
  color: var(--sm-text-tertiary);
  margin-bottom: 8px;
}
.explore__error {
  margin-bottom: 12px;
}
.explore__sharded {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.explore__sharded-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.explore__results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.explore__card {
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  padding: 8px 12px;
  background: var(--sm-bg-container);
  cursor: pointer;
}
.explore__card--dense {
  box-shadow: none;
}
.explore__card--dense:hover,
.explore__card--selected {
  border-color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
  box-shadow: inset 3px 0 0 var(--sm-color-primary);
}
.explore__card--dense:hover .explore__card-name,
.explore__card--selected .explore__card-name {
  color: var(--sm-color-primary);
}
.explore__card-head {
  display: flex;
  align-items: center;
  gap: 6px 8px;
  flex-wrap: wrap;
  min-height: 24px;
}
.explore__card-icon {
  font-size: 20px;
  color: var(--sm-color-primary);
  flex-shrink: 0;
}
.explore__card-crumbs {
  font-size: 12px;
  margin-bottom: 2px;
}
.explore__matches {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  margin-bottom: 2px;
  font-size: 12px;
}
.explore__card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-text-primary);
  line-height: 1.3;
}
.explore__desc {
  margin-bottom: 2px;
}
.explore__desc {
  font-size: 13px;
  color: var(--sm-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
}
.explore__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 2px;
  font-size: 12px;
  color: var(--sm-text-tertiary);
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
