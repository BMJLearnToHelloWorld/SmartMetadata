/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { FacetId } from './searchFacets';
import { aggregationFieldNamesForFacet, NULL_OPTION_KEY } from './searchFacets';
import { estateFromQuery } from './browseEstate';

export type SearchFilters = Partial<Record<FacetId, string[]>>;

export const FILTER_LUCENE_FIELD: Record<FacetId, string> = {
  entityType: 'entityType',
  serviceType: 'serviceType',
  service: 'service.displayName.keyword',
  // Pin TABLE/COLUMN dropdown fields (AdvancedSearch.constants.ts):
  // the display-name variants, matching the database/schema facets'
  // aggregation sources (catalog/searchFacets.ts).
  database: 'database.displayName.keyword',
  schema: 'databaseSchema.displayName.keyword',
  tagFqn: 'tags.tagFQN',
  owner: 'ownerDisplayName',
  domain: 'domains.displayName.keyword',
  tier: 'tier.tagFQN',
  certification: 'certification.tagLabel.tagFQN',
  dataProduct: 'dataProducts.displayName.keyword',
  // Per-tab fields (pin EntityFields): none of these has a page
  // aggregation; their options come from POST /v1/search/aggregate.
  column: 'columns.name.keyword',
  tableType: 'tableType',
  columnDescriptionStatus: 'columnDescriptionStatus',
  dataType: 'dataType',
  tableName: 'table.name.keyword',
  classification: 'classification.name.keyword',
  glossary: 'glossary.name.keyword',
  entityStatus: 'entityStatus',
  dataModel: 'dataModels.displayName.keyword',
  chart: 'charts.displayName.keyword',
  project: 'project.keyword',
  task: 'tasks.displayName.keyword',
  schemaField: 'messageSchema.schemaFields.name.keyword',
  field: 'fields.name.keyword',
  feature: 'mlFeatures.name',
  requestSchemaField: 'requestSchema.schemaFields.name.keyword',
  responseSchemaField: 'responseSchema.schemaFields.name.keyword',
  containerColumn: 'dataModel.columns.name.keyword',
  dataModelType: 'dataModelType',
};

export const SORT_OPTIONS = [
  { id: 'relevance', field: '_score', defaultOrder: 'desc' },
  { id: 'popularity', field: 'totalVotes', defaultOrder: 'desc' },
  { id: 'name', field: 'displayName.keyword', defaultOrder: 'asc' },
  { id: 'updated', field: 'updatedAt', defaultOrder: 'desc' },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]['id'];
export type SortOrder = 'asc' | 'desc';

export interface SearchSort {
  id: SortId;
  order: SortOrder;
}

export const DEFAULT_SORT: SearchSort = { id: 'relevance', order: 'desc' };

/**
 * Official page-size options (ExploreV1 EXPLORE_PAGE_SIZE_OPTIONS over
 * constants PAGE_SIZE_BASE / PAGE_SIZE_MEDIUM / PAGE_SIZE_LARGE): 15 / 25 / 50.
 * The default is PAGE_SIZE_BASE (15); a URL value outside this table is
 * ignored, matching the official usePaging behaviour for invalid pageSize.
 */
export const EXPLORE_PAGE_SIZE_OPTIONS = [15, 25, 50] as const;

export type ExplorePageSize = (typeof EXPLORE_PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_EXPLORE_PAGE_SIZE: ExplorePageSize = 15;

export function pageSizeFromQuery(value: unknown, fallback: number = DEFAULT_EXPLORE_PAGE_SIZE): ExplorePageSize {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : typeof raw === 'number' ? raw : Number.NaN;
  const matched = (EXPLORE_PAGE_SIZE_OPTIONS as readonly number[]).find((option) => option === parsed);
  if (matched !== undefined) {
    return matched as ExplorePageSize;
  }
  const fallbackMatched = (EXPLORE_PAGE_SIZE_OPTIONS as readonly number[]).find((option) => option === fallback);
  return (fallbackMatched ?? DEFAULT_EXPLORE_PAGE_SIZE) as ExplorePageSize;
}

/**
 * Official index-not-found markers (ExplorePureUtils isElasticsearchError
 * over explore.constants FAILED_TO_FIND_INDEX_ERROR / ES_EXCEPTION_SHARDS_FAILED).
 * The double "to" in the first marker is the official string, kept verbatim.
 */
export const INDEX_NOT_FOUND_MARKERS = ['Failed to to find index', 'reason=all shards failed'] as const;

export function isIndexNotFoundError(message: unknown): boolean {
  return typeof message === 'string' && INDEX_NOT_FOUND_MARKERS.some((marker) => message.includes(marker));
}

const SPECIAL = /[\s+\-!(){}[\]^"~*?:\\/]/;

export function luceneTerm(field: string, value: string): string {
  if (SPECIAL.test(value)) {
    return `${field}:"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `${field}:${value}`;
}

export function composeSearchQuery(userQuery: string, filters: SearchFilters = {}): string {
  const clauses: string[] = [];
  const trimmed = userQuery.trim();
  if (trimmed && trimmed !== '*') {
    clauses.push(trimmed);
  }
  for (const id of Object.keys(FILTER_LUCENE_FIELD) as FacetId[]) {
    // A "No X" selection is a structured must_not.exists clause in
    // query_filter (nullExistsQueryFilter), never a Lucene term: the
    // sentinel value has no meaning as a field value.
    const values = (filters[id] ?? []).filter(
      (value) => value.trim().length > 0 && value !== NULL_OPTION_KEY,
    );
    if (!values.length) {
      continue;
    }
    const field = FILTER_LUCENE_FIELD[id];
    if (values.length === 1) {
      clauses.push(luceneTerm(field, values[0]));
    } else {
      clauses.push(`(${values.map((value) => luceneTerm(field, value)).join(' OR ')})`);
    }
  }
  return clauses.length ? clauses.join(' AND ') : '*';
}

/**
 * Pin ExplorePureUtils.getExploreQueryFilterMust: a NULL_OPTION_KEY
 * selection becomes `{bool: {must_not: {exists: {field}}}}` inside the
 * same OR group as the facet's term clauses. The product renders that
 * shape as a standalone `query_filter` JSON string (one must clause per
 * facet with a null selection), merged with the URL's saved `query_filter`
 * by mergeQueryFilters. `excludeId` drops one facet's null selection —
 * the options query for a facet must not narrow by its own field
 * (self-exclusion, ADR:2026-11-11-explore-facet-self-exclusion).
 */
export function nullExistsQueryFilter(
  filters: SearchFilters = {},
  excludeId?: FacetId,
): string | undefined {
  const must: Array<Record<string, unknown>> = [];
  for (const id of Object.keys(FILTER_LUCENE_FIELD) as FacetId[]) {
    if (id === excludeId) {
      continue;
    }
    if ((filters[id] ?? []).includes(NULL_OPTION_KEY)) {
      must.push({
        bool: {
          should: [{ bool: { must_not: { exists: { field: FILTER_LUCENE_FIELD[id] } } } }],
        },
      });
    }
  }
  if (!must.length) {
    return undefined;
  }
  return JSON.stringify({ query: { bool: { must } } });
}

function mustClausesOf(filterJson: string): Array<Record<string, unknown>> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(filterJson) as unknown;
  } catch {
    return null;
  }
  const root = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  if (!root) {
    return null;
  }
  const query = root.query !== null && typeof root.query === 'object' ? (root.query as Record<string, unknown>) : null;
  if (!query) {
    return [root];
  }
  const bool = query.bool !== null && typeof query.bool === 'object' ? (query.bool as Record<string, unknown>) : null;
  if (!bool) {
    return [query];
  }
  if (Array.isArray(bool.must)) {
    return bool.must as Array<Record<string, unknown>>;
  }
  if (bool.must !== null && typeof bool.must === 'object') {
    return [bool.must as Record<string, unknown>];
  }
  return [query];
}

/**
 * Combine serialized `query_filter` JSON strings into one filter whose
 * `must` is the concatenation of every input's must clauses (pin
 * getCombinedQueryFilterObject shape). Inputs that are undefined or empty
 * are skipped; with no clauses at all the result is undefined. A single
 * input is returned verbatim — there is nothing to combine, and
 * re-serializing it would change its exact string (D28: an unparseable
 * saved filter must still reach the server unchanged). An unparseable
 * input is returned verbatim instead of merged — the saved filter it
 * carries must not be silently dropped to make room for a null selection.
 */
export function mergeQueryFilters(...filters: Array<string | undefined>): string | undefined {
  const present = filters.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (!present.length) {
    return undefined;
  }
  if (present.length === 1) {
    return present[0];
  }
  if (present.some((item) => mustClausesOf(item) === null)) {
    return present[0];
  }
  const must = present.flatMap((item) => mustClausesOf(item) ?? []);
  if (!must.length) {
    return undefined;
  }
  return JSON.stringify({ query: { bool: { must } } });
}

/**
 * The facet ids whose filter must be left out of one facet's own options
 * query. A filter is excluded when its Lucene field is one of the facet's
 * own aggregation names — or the facet's own Lucene field itself. The
 * second arm matters since database/schema filter on the display-name
 * `.keyword` field while their aggregations are named `database.name`
 * / `database.displayName` (no `.keyword` suffix): without it the
 * database chip would narrow its own options by its own selection.
 * Official keeps two entity-type filter keys (`entityType` and
 * `entityType.keyword`) and excludes both when the entity-type dropdown
 * opens; this console collapses them into the one `entityType` FacetId,
 * so the derivation yields just `['entityType']` — the `.keyword`
 * aggregation name is recorded in AGG_TO_FACET, but there is no second
 * filter id to exclude.
 */
export function selfExcludedFacetIds(facetId: FacetId): FacetId[] {
  const ownFields = new Set([
    ...aggregationFieldNamesForFacet(facetId),
    FILTER_LUCENE_FIELD[facetId],
  ]);
  return (Object.keys(FILTER_LUCENE_FIELD) as FacetId[]).filter((id) =>
    ownFields.has(FILTER_LUCENE_FIELD[id]),
  );
}

/**
 * Official ExploreQuickFilters.getFacetQueryFilter
 * (components/Explore/ExploreQuickFilters.tsx), ported to this console's
 * Lucene `q` transport: the query behind one facet's options is built
 * from every active filter EXCEPT that facet's own — selecting a value
 * must not shrink its own facet's list to just the selection. The free
 * text and every other filter are kept, so the options still narrow by
 * the other active facets. The excluded ids come from
 * `selfExcludedFacetIds`, derived from the facet's own mapping.
 * ADR:2026-11-11-explore-facet-self-exclusion.
 */
export function composeFacetQuery(userQuery: string, filters: SearchFilters = {}, facetId: FacetId): string {
  const excluded = new Set(selfExcludedFacetIds(facetId));
  const kept: SearchFilters = {};
  for (const id of Object.keys(FILTER_LUCENE_FIELD) as FacetId[]) {
    if (!excluded.has(id) && (filters[id]?.length ?? 0) > 0) {
      kept[id] = filters[id];
    }
  }
  return composeSearchQuery(userQuery, kept);
}

export function readQueryList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : []));
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function filtersFromQuery(query: Record<string, unknown>): SearchFilters {
  const filters: SearchFilters = {};
  (Object.keys(FILTER_LUCENE_FIELD) as FacetId[]).forEach((id) => {
    const values = readQueryList(query[id]);
    if (values.length) {
      filters[id] = values;
    }
  });
  return filters;
}

export function filtersToQuery(filters: SearchFilters): Record<string, string> {
  const next: Record<string, string> = {};
  (Object.keys(FILTER_LUCENE_FIELD) as FacetId[]).forEach((id) => {
    const values = filters[id];
    if (values?.length) {
      next[id] = values.join(',');
    }
  });
  return next;
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return (Object.keys(FILTER_LUCENE_FIELD) as FacetId[]).some((id) => (filters[id]?.length ?? 0) > 0);
}

export function toggleFilterValue(filters: SearchFilters, id: FacetId, value: string): SearchFilters {
  const current = filters[id] ?? [];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  return {
    ...filters,
    [id]: next,
  };
}

export function pageFromQuery(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : typeof raw === 'number' ? raw : 0;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function sortFromQuery(query: Record<string, unknown>): SearchSort {
  const raw = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const option = SORT_OPTIONS.find((item) => item.id === raw) ?? SORT_OPTIONS[0];
  const rawOrder = Array.isArray(query.order) ? query.order[0] : query.order;
  const order: SortOrder = rawOrder === 'asc' || rawOrder === 'desc' ? rawOrder : option.defaultOrder;
  return { id: option.id, order };
}

export function sortField(sort: SearchSort): string {
  return SORT_OPTIONS.find((item) => item.id === sort.id)?.field ?? '_score';
}

export interface SearchRouteOptions {
  sort?: SearchSort;
  estate?: string;
  /**
   * Explore tab index (D13): the global search bar submits with the
   * scope the user picked (`tab=<index>`), and pin always forces
   * `sort=_score` on that submit. Empty means the all-tab — no `tab`
   * param, exactly as pin navigates with an empty tab for All.
   */
  tab?: string;
}

export function searchRouteQuery(
  userQuery: string,
  filters: SearchFilters,
  page = 0,
  options: SearchRouteOptions = {},
): Record<string, string> {
  const next = filtersToQuery(filters);
  const trimmed = userQuery.trim();
  if (trimmed) {
    next.q = trimmed;
  }
  if (page > 0) {
    next.page = String(page);
  }
  const sort = options.sort ?? DEFAULT_SORT;
  if (sort.id !== DEFAULT_SORT.id) {
    next.sort = sort.id;
  }
  const option = SORT_OPTIONS.find((item) => item.id === sort.id) ?? SORT_OPTIONS[0];
  if (sort.order !== option.defaultOrder) {
    next.sort = sort.id;
    next.order = sort.order;
  }
  const estate = options.estate ?? '';
  if (estate) {
    next.estate = estate;
  }
  const tab = options.tab ?? '';
  if (tab) {
    next.tab = tab;
  }
  return next;
}

export function searchRouteFromLocation(
  userQuery: string,
  query: Record<string, unknown>,
  page = 0,
  overrides: SearchRouteOptions & { filters?: SearchFilters } = {},
): Record<string, string> {
  return searchRouteQuery(
    userQuery,
    overrides.filters ?? filtersFromQuery(query),
    page,
    {
      sort: overrides.sort ?? sortFromQuery(query),
      estate: overrides.estate ?? estateFromQuery(query),
      tab: overrides.tab,
    },
  );
}
