/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Explore tabs, mapped from the official SearchClassBase.getTabsInfo():
 * one entry per official SearchIndex tab, with its sorting-field group.
 * The table is data, not code branches: adding a tab means adding a row.
 * Sorting groups mirror official explore.constants.ts (table / entity /
 * tag / column). The 'all' pseudo-tab preserves this console's existing
 * dataAsset behaviour; official Explore has no all-tab.
 */
export type ExploreSortGroup = 'table' | 'entity' | 'tag' | 'column';

export interface ExploreSortOption {
  id: string;
  field: string;
  defaultOrder: 'asc' | 'desc';
}

export const EXPLORE_SORT_GROUPS: Record<ExploreSortGroup, ExploreSortOption[]> = {
  table: [
    { id: 'popularity', field: 'totalVotes', defaultOrder: 'desc' },
    { id: 'name', field: 'displayName.keyword', defaultOrder: 'asc' },
    { id: 'weeklyUsage', field: 'usageSummary.weeklyStats.count', defaultOrder: 'desc' },
    { id: 'relevance', field: '_score', defaultOrder: 'desc' },
    { id: 'updated', field: 'updatedAt', defaultOrder: 'desc' },
  ],
  entity: [
    { id: 'popularity', field: 'totalVotes', defaultOrder: 'desc' },
    { id: 'name', field: 'displayName.keyword', defaultOrder: 'asc' },
    { id: 'relevance', field: '_score', defaultOrder: 'desc' },
    { id: 'updated', field: 'updatedAt', defaultOrder: 'desc' },
  ],
  tag: [
    { id: 'name', field: 'displayName.keyword', defaultOrder: 'asc' },
    { id: 'relevance', field: '_score', defaultOrder: 'desc' },
    { id: 'updated', field: 'updatedAt', defaultOrder: 'desc' },
  ],
  column: [
    { id: 'dataType', field: 'dataType', defaultOrder: 'asc' },
    { id: 'table', field: 'table.name.keyword', defaultOrder: 'asc' },
    { id: 'name', field: 'displayName.keyword', defaultOrder: 'asc' },
    { id: 'relevance', field: '_score', defaultOrder: 'desc' },
    { id: 'updated', field: 'updatedAt', defaultOrder: 'desc' },
  ],
};

export interface ExploreTab {
  /** Official SearchIndex value; also the /v1/search/query index param. */
  index: string;
  /** URL slug for the tab, mirroring official ExplorePageTabs paths. */
  slug: string;
  /** Entity type used to read hit counts from entityType aggregations. */
  entityType: string;
  sortGroup: ExploreSortGroup;
  /** i18n key under explore.entity.* (tab labels reuse entity labels). */
  labelKey: string;
  /**
   * Override for the tab default sort id. Only the API tabs set it:
   * official `getTabsInfo` gives API_COLLECTION/API_ENDPOINT
   * `sortField: INITIAL_SORT_FIELD` (`totalVotes`) although their
   * `sortingFields` are the tag group, which has no totalVotes —
   * the pin quirk (SearchClassBase.ts:610-627). `defaultSortForTab`
   * resolves such an id against every group when the tab's own group
   * lacks it.
   */
  defaultSortId?: string;
}

export const EXPLORE_TABS: ExploreTab[] = [
  { index: 'table', slug: 'tables', entityType: 'table', sortGroup: 'table', labelKey: 'table' },
  { index: 'tableColumn', slug: 'columns', entityType: 'tableColumn', sortGroup: 'column', labelKey: 'column' },
  { index: 'storedProcedure', slug: 'storedProcedure', entityType: 'storedProcedure', sortGroup: 'entity', labelKey: 'storedProcedure' },
  { index: 'database', slug: 'database', entityType: 'database', sortGroup: 'entity', labelKey: 'database' },
  { index: 'databaseSchema', slug: 'databaseSchema', entityType: 'databaseSchema', sortGroup: 'entity', labelKey: 'databaseSchema' },
  { index: 'dashboard', slug: 'dashboards', entityType: 'dashboard', sortGroup: 'entity', labelKey: 'dashboard' },
  { index: 'dashboardDataModel', slug: 'dashboardDataModel', entityType: 'dashboardDataModel', sortGroup: 'entity', labelKey: 'dashboardDataModel' },
  { index: 'chart', slug: 'charts', entityType: 'chart', sortGroup: 'entity', labelKey: 'chart' },
  { index: 'pipeline', slug: 'pipelines', entityType: 'pipeline', sortGroup: 'entity', labelKey: 'pipeline' },
  { index: 'topic', slug: 'topics', entityType: 'topic', sortGroup: 'entity', labelKey: 'topic' },
  { index: 'mlmodel', slug: 'mlmodels', entityType: 'mlmodel', sortGroup: 'entity', labelKey: 'mlmodel' },
  { index: 'container', slug: 'containers', entityType: 'container', sortGroup: 'entity', labelKey: 'container' },
  { index: 'searchIndex', slug: 'searchIndexes', entityType: 'searchIndex', sortGroup: 'entity', labelKey: 'searchIndex' },
  { index: 'glossaryTerm', slug: 'glossaries', entityType: 'glossaryTerm', sortGroup: 'entity', labelKey: 'glossaryTerm' },
  { index: 'tag', slug: 'tags', entityType: 'tag', sortGroup: 'tag', labelKey: 'tag' },
  { index: 'dataProduct', slug: 'dataProducts', entityType: 'dataProduct', sortGroup: 'tag', labelKey: 'dataProduct' },
  { index: 'apiCollection', slug: 'apiCollection', entityType: 'apiCollection', sortGroup: 'tag', labelKey: 'apiCollection', defaultSortId: 'popularity' },
  { index: 'apiEndpoint', slug: 'apiEndpoint', entityType: 'apiEndpoint', sortGroup: 'tag', labelKey: 'apiEndpoint', defaultSortId: 'popularity' },
  { index: 'metric', slug: 'metric', entityType: 'metric', sortGroup: 'tag', labelKey: 'metric' },
  { index: 'directory', slug: 'directories', entityType: 'directory', sortGroup: 'tag', labelKey: 'directory' },
  { index: 'file', slug: 'files', entityType: 'file', sortGroup: 'tag', labelKey: 'file' },
  { index: 'spreadsheet', slug: 'spreadsheets', entityType: 'spreadsheet', sortGroup: 'tag', labelKey: 'spreadsheet' },
  { index: 'worksheet', slug: 'worksheets', entityType: 'worksheet', sortGroup: 'tag', labelKey: 'worksheet' },
  { index: 'page', slug: 'knowledgePages', entityType: 'page', sortGroup: 'entity', labelKey: 'knowledgePage' },
];

import type { FacetId } from './searchFacets';

/**
 * Per-tab filter sets, ported from official
 * SearchClassBase.getDropDownItems (utils/SearchClassBase.ts:676-734)
 * over AdvancedSearch.constants.ts. The all-tab (null) is the DATA_ASSET
 * set — the only set with entityType and certification. Chart, directory,
 * file, spreadsheet and worksheet have no pin entry, so they show no
 * chips (getDropDownItems returns [] for an unmapped index).
 */
export const COMMON_TAB_FACET_IDS: readonly FacetId[] = [
  'domain',
  'dataProduct',
  'owner',
  'tagFqn',
  'tier',
  'service',
  'serviceType',
];

export const DATA_ASSET_TAB_FACET_IDS: readonly FacetId[] = [
  'entityType',
  'domain',
  'dataProduct',
  'owner',
  'tagFqn',
  'tier',
  'certification',
  'service',
  'serviceType',
];

const TAB_FACET_IDS: Readonly<Record<string, readonly FacetId[]>> = {
  table: [...COMMON_TAB_FACET_IDS, 'database', 'schema', 'column', 'tableType', 'columnDescriptionStatus'],
  tableColumn: ['dataType', 'tableName', 'database', 'schema'],
  storedProcedure: [...COMMON_TAB_FACET_IDS],
  database: [...COMMON_TAB_FACET_IDS],
  databaseSchema: [...COMMON_TAB_FACET_IDS],
  dashboard: [...COMMON_TAB_FACET_IDS, 'dataModel', 'chart', 'project'],
  dashboardDataModel: [...COMMON_TAB_FACET_IDS, 'dataModelType', 'column', 'project'],
  chart: [],
  pipeline: [...COMMON_TAB_FACET_IDS, 'task'],
  topic: [...COMMON_TAB_FACET_IDS, 'schemaField'],
  mlmodel: [...COMMON_TAB_FACET_IDS, 'feature'],
  container: [...COMMON_TAB_FACET_IDS, 'containerColumn'],
  searchIndex: [...COMMON_TAB_FACET_IDS, 'field'],
  glossaryTerm: ['domain', 'owner', 'tagFqn', 'glossary', 'entityStatus'],
  tag: ['domain', 'classification'],
  dataProduct: ['domain', 'owner'],
  apiCollection: [...COMMON_TAB_FACET_IDS],
  apiEndpoint: [...COMMON_TAB_FACET_IDS, 'requestSchemaField', 'responseSchemaField'],
  metric: [...COMMON_TAB_FACET_IDS],
  directory: [],
  file: [],
  spreadsheet: [],
  worksheet: [],
  page: ['owner', 'tagFqn'],
};

/** The filter chips for a tab; the all-tab (null) shows the data-asset set. */
export function facetsForTab(tab: ExploreTab | null): FacetId[] {
  if (!tab) {
    return [...DATA_ASSET_TAB_FACET_IDS];
  }
  return [...(TAB_FACET_IDS[tab.index] ?? [])];
}

export function exploreTabForIndex(index: string): ExploreTab | null {
  return EXPLORE_TABS.find((tab) => tab.index === index) ?? null;
}

export function exploreTabForSlug(slug: string): ExploreTab | null {
  return EXPLORE_TABS.find((tab) => tab.slug === slug) ?? null;
}

/** The tab named by the route query, or null for the 'all' pseudo-tab. */
export function exploreTabFromQuery(query: Record<string, unknown>): ExploreTab | null {
  const raw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  if (typeof raw !== 'string' || !raw) {
    return null;
  }
  return exploreTabForIndex(raw) ?? exploreTabForSlug(raw);
}

/**
 * The tab named by the route: the `/explore/:tab` path param (pin
 * `ROUTES.EXPLORE_WITH_TAB`) wins; a legacy `?tab=` query still resolves
 * (index or slug) so old links and bookmarks keep working.
 */
export function exploreTabFromRoute(route: {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
}): ExploreTab | null {
  const raw = Array.isArray(route.params.tab) ? route.params.tab[0] : route.params.tab;
  if (typeof raw === 'string' && raw) {
    return exploreTabForSlug(raw) ?? null;
  }
  return exploreTabFromQuery(route.query);
}

/**
 * Official `findActiveSearchIndex` (utils/ExplorePureUtils.ts:114),
 * verbatim semantics: among the tabs with hits, prefer the top hit's
 * tab when it has hits, else the tab with the highest count (first in
 * `EXPLORE_TABS` order wins a tie — the reducer keeps the earlier key
 * on a strict `>`). Counts are keyed by entity type, as the counts
 * endpoint returns them; `null` means no tab has hits (pin falls back
 * to the dataAsset index then). NLQ callers pass no top hit: pin's
 * top hit is arbitrary under NLQ's RRF ranking, so only the counts
 * decide there.
 */
export function findActiveSearchIndex(
  counts: Map<string, number>,
  topHitEntityType?: string | null,
): ExploreTab | null {
  const withHits = EXPLORE_TABS.filter((tab) => (counts.get(tab.entityType) ?? 0) > 0);
  if (topHitEntityType) {
    const topHitTab = withHits.find((tab) => tab.entityType === topHitEntityType);
    if (topHitTab) {
      return topHitTab;
    }
  }
  return withHits.reduce<ExploreTab | null>(
    (active, tab) =>
      active === null || (counts.get(tab.entityType) ?? 0) > (counts.get(active.entityType) ?? 0)
        ? tab
        : active,
    null,
  );
}

export function sortOptionsForTab(tab: ExploreTab | null): ExploreSortOption[] {
  return EXPLORE_SORT_GROUPS[tab?.sortGroup ?? 'entity'];
}

/**
 * Official defaults: totalVotes for table/entity groups, displayName for
 * tag/column groups (TAGS_INITIAL_SORT_FIELD; column default is name,
 * not the first sorting field, which is dataType). A tab with a
 * `defaultSortId` override (the API tabs) resolves it against its own
 * group first, then against every group, so the pin quirk default of
 * totalVotes survives although the tag group has no popularity option.
 */
export function defaultSortForTab(tab: ExploreTab | null): ExploreSortOption {
  const options = sortOptionsForTab(tab);
  if (tab?.defaultSortId) {
    const inGroup = options.find((option) => option.id === tab.defaultSortId);
    if (inGroup) {
      return inGroup;
    }
    const known = Object.values(EXPLORE_SORT_GROUPS)
      .flat()
      .find((option) => option.id === tab.defaultSortId);
    if (known) {
      return known;
    }
  }
  const group = tab?.sortGroup ?? 'entity';
  const defaultId = group === 'tag' || group === 'column' ? 'name' : 'popularity';
  return options.find((option) => option.id === defaultId) ?? options[0];
}

export interface ExploreSort {
  id: string;
  order: 'asc' | 'desc';
  field: string;
}

/**
 * Resolve the sort from the route query against a tab's options, mirroring
 * official behaviour: a sort id that is not selectable on the active tab
 * falls back to that tab's default instead of rendering a blank label.
 */
function firstQueryValue(query: Record<string, unknown>, key: string): unknown {
  const raw = query[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Resolve a URL sort value against a tab. Official writes the Elasticsearch
 * field (sort=totalVotes); older product links used the option id
 * (sort=popularity). Both are accepted so existing links keep working.
 * An unsupported value (or a missing sort) falls back to the tab default,
 * matching official effectiveSortValue.
 */
export function exploreSortOptionFromValue(raw: unknown, tab: ExploreTab | null): ExploreSortOption {
  const options = sortOptionsForTab(tab);
  const fallback = defaultSortForTab(tab);
  if (typeof raw !== 'string' || !raw) {
    return fallback;
  }
  return options.find((item) => item.field === raw) ?? options.find((item) => item.id === raw) ?? fallback;
}

/**
 * Official Explore URL contract: sort=<ES field> and sortOrder.
 * order and option ids are read-only compatibility for older product links.
 */
export function exploreSortFromQuery(query: Record<string, unknown>, tab: ExploreTab | null): ExploreSort {
  const option = exploreSortOptionFromValue(firstQueryValue(query, 'sort'), tab);
  const rawOrder = firstQueryValue(query, 'sortOrder') ?? firstQueryValue(query, 'order');
  const order = rawOrder === 'asc' || rawOrder === 'desc' ? rawOrder : option.defaultOrder;
  return { id: option.id, order, field: option.field };
}

function resolveSortOption(sort: { id: string; order: 'asc' | 'desc' }, tab: ExploreTab | null): ExploreSortOption {
  const options = sortOptionsForTab(tab);
  const inGroup = options.find((item) => item.id === sort.id);
  if (inGroup) {
    return inGroup;
  }
  const known = Object.values(EXPLORE_SORT_GROUPS).flat().find((item) => item.id === sort.id);
  return known ?? defaultSortForTab(tab);
}

/**
 * Write official sort / sortOrder query params. The default field and
 * order for the tab are omitted, matching official parseSearchParams
 * defaults (	otalVotes / desc for the entity and table groups).
 */
export function exploreSortQueryParams(
  sort: { id: string; order: 'asc' | 'desc' },
  tab: ExploreTab | null,
): Record<string, string> {
  const option = resolveSortOption(sort, tab);
  const fallback = defaultSortForTab(tab);
  const next: Record<string, string> = {};
  if (option.field !== fallback.field) {
    next.sort = option.field;
  }
  if (sort.order !== option.defaultOrder) {
    next.sort = option.field;
    next.sortOrder = sort.order;
  }
  return next;
}
