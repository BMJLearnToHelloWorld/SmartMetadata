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
}

export const EXPLORE_TABS: ExploreTab[] = [
  { index: 'table', slug: 'tables', entityType: 'table', sortGroup: 'table', labelKey: 'table' },
  { index: 'tableColumn', slug: 'columns', entityType: 'tableColumn', sortGroup: 'column', labelKey: 'column' },
  { index: 'storedProcedure', slug: 'storedProcedures', entityType: 'storedProcedure', sortGroup: 'entity', labelKey: 'storedProcedure' },
  { index: 'database', slug: 'databases', entityType: 'database', sortGroup: 'entity', labelKey: 'database' },
  { index: 'databaseSchema', slug: 'databaseSchemas', entityType: 'databaseSchema', sortGroup: 'entity', labelKey: 'databaseSchema' },
  { index: 'dashboard', slug: 'dashboards', entityType: 'dashboard', sortGroup: 'entity', labelKey: 'dashboard' },
  { index: 'dashboardDataModel', slug: 'dashboardDataModels', entityType: 'dashboardDataModel', sortGroup: 'entity', labelKey: 'dashboardDataModel' },
  { index: 'chart', slug: 'charts', entityType: 'chart', sortGroup: 'entity', labelKey: 'chart' },
  { index: 'pipeline', slug: 'pipelines', entityType: 'pipeline', sortGroup: 'entity', labelKey: 'pipeline' },
  { index: 'topic', slug: 'topics', entityType: 'topic', sortGroup: 'entity', labelKey: 'topic' },
  { index: 'mlmodel', slug: 'mlmodels', entityType: 'mlmodel', sortGroup: 'entity', labelKey: 'mlmodel' },
  { index: 'container', slug: 'containers', entityType: 'container', sortGroup: 'entity', labelKey: 'container' },
  { index: 'searchIndex', slug: 'searchIndexes', entityType: 'searchIndex', sortGroup: 'entity', labelKey: 'searchIndex' },
  { index: 'glossaryTerm', slug: 'glossaryTerms', entityType: 'glossaryTerm', sortGroup: 'entity', labelKey: 'glossaryTerm' },
  { index: 'tag', slug: 'tags', entityType: 'tag', sortGroup: 'tag', labelKey: 'tag' },
  { index: 'dataProduct', slug: 'dataProducts', entityType: 'dataProduct', sortGroup: 'tag', labelKey: 'dataProduct' },
  { index: 'apiCollection', slug: 'apiCollections', entityType: 'apiCollection', sortGroup: 'tag', labelKey: 'apiCollection' },
  { index: 'apiEndpoint', slug: 'apiEndpoints', entityType: 'apiEndpoint', sortGroup: 'tag', labelKey: 'apiEndpoint' },
  { index: 'metric', slug: 'metrics', entityType: 'metric', sortGroup: 'tag', labelKey: 'metric' },
  { index: 'directory', slug: 'directories', entityType: 'directory', sortGroup: 'tag', labelKey: 'directory' },
  { index: 'file', slug: 'files', entityType: 'file', sortGroup: 'tag', labelKey: 'file' },
  { index: 'spreadsheet', slug: 'spreadsheets', entityType: 'spreadsheet', sortGroup: 'tag', labelKey: 'spreadsheet' },
  { index: 'worksheet', slug: 'worksheets', entityType: 'worksheet', sortGroup: 'tag', labelKey: 'worksheet' },
  { index: 'page', slug: 'knowledgePages', entityType: 'page', sortGroup: 'entity', labelKey: 'knowledgePage' },
];

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

export function sortOptionsForTab(tab: ExploreTab | null): ExploreSortOption[] {
  return EXPLORE_SORT_GROUPS[tab?.sortGroup ?? 'entity'];
}

/**
 * Official defaults: totalVotes for table/entity groups, displayName for
 * tag/column groups (TAGS_INITIAL_SORT_FIELD; column default is name,
 * not the first sorting field, which is dataType).
 */
export function defaultSortForTab(tab: ExploreTab | null): ExploreSortOption {
  const options = sortOptionsForTab(tab);
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
export function exploreSortFromQuery(query: Record<string, unknown>, tab: ExploreTab | null): ExploreSort {
  const options = sortOptionsForTab(tab);
  const raw = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const option = options.find((item) => item.id === raw) ?? defaultSortForTab(tab);
  const rawOrder = Array.isArray(query.order) ? query.order[0] : query.order;
  const order = rawOrder === 'asc' || rawOrder === 'desc' ? rawOrder : option.defaultOrder;
  return { id: option.id, order, field: option.field };
}
