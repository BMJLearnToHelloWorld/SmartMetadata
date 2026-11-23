/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Server-backed impact analysis — the pure half of the official
 * `LineageTable` (openmetadata-ui components/LineageTable/
 * LineageTable.tsx at a3012259ca, 1081 lines).
 *
 * Pin's impact tab is NOT the client-side BFS over the fetched graph
 * (that was the product's `LineageImpactPanel` / `lineage/impact.ts`,
 * D-GRAPH-3): table level fetches `getLineageByEntityCount` (nodes +
 * per-depth pagination info, server-paged by from/size) and column
 * level fetches `getLineageDataByFQN` in one direction and expands its
 * edges into per-column rows (`prepareColumnLevelNodesFromEdges`).
 * Quick filters split the same way: table-level filters + the search
 * term become the `query_filter` JSON bool query, while column/tag
 * filters (+ the search term, at column level) become the
 * `column_filter` string (`columnName:…`, `tag:…`, `glossary:…`).
 *
 * This module holds every rule that can be tested without Vue: response
 * parsing, the filter split, direction counts, depth options, URL
 * params, and FQN display. `LineageTable.vue` owns fetching, paging
 * state and rendering; search highlighting reuses the shared
 * `HighlightedText` component (ported from pin's `highlightSearchText`).
 */
import { splitFqn } from '@/catalog/fqn';
import { LIST_PAGE_SIZE_OPTIONS, PAGE_SIZE_BASE } from '@/catalog/servicePaging';
import { asRecord, asString } from '@/api/json';
import type { LineageTableDirection } from '@/api/lineage';
import {
  buildLineageQueryFilter,
  type LineageQuickFilterKey,
  type LineageQuickFilterSelection,
} from './quickFilters';

/** Pin `EImpactLevel` values (LineageTable.interface.ts). */
export type LineageImpactLevel = 'table' | 'column';

export const LINEAGE_IMPACT_LEVELS: readonly LineageImpactLevel[] = ['table', 'column'];

export function parseLineageImpactLevel(value: unknown): LineageImpactLevel {
  return value === 'column' ? 'column' : 'table';
}

/** Entity reference as it arrives in the ES entity map (id/name/displayName/type). */
export interface LineageTableEntityRef {
  id: string;
  name: string;
  displayName: string;
  fullyQualifiedName: string;
  type: string;
}

export interface LineageTableTag {
  tagFQN: string;
  name: string;
  source: string;
}

function parseEntityRef(value: unknown): LineageTableEntityRef {
  const rec = asRecord(value) ?? {};
  return {
    id: asString(rec.id),
    name: asString(rec.name),
    displayName: asString(rec.displayName),
    fullyQualifiedName: asString(rec.fullyQualifiedName),
    type: asString(rec.type) || asString(rec.entityType),
  };
}

function parseEntityRefs(value: unknown): LineageTableEntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => parseEntityRef(item)).filter((ref) => ref.id || ref.fullyQualifiedName || ref.name);
}

function parseTag(value: unknown): LineageTableTag | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const tagFQN = asString(rec.tagFQN);
  if (!tagFQN) {
    return null;
  }
  return { tagFQN, name: asString(rec.name), source: asString(rec.source) };
}

function parseTags(value: unknown): LineageTableTag[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const tag = parseTag(item);
    return tag ? [tag] : [];
  });
}

/**
 * Tier as the product's ES entity map carries it (`catalog/searchHits.ts`
 * `mapTier`): a plain string (`'Tier.Tier1'`) or a nested tag object.
 * Pin's `TierTag` takes a TagLabel; the product renders the tier string
 * (SearchView precedent), so the row keeps the string.
 */
function parseTier(value: unknown): string | undefined {
  const direct = asString(value);
  if (direct) {
    return direct;
  }
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return asString(rec.tagFQN) || asString(rec.name) || asString(rec.displayName) || undefined;
}

/**
 * A table-level impact row — pin's `LineageNode` as the table renders
 * it: the ES entity map plus its `nodeDepth` and paging counts
 * (`{...entity, ...paging, nodeDepth}` in LineageTable.tsx).
 * `tags` are classification tags; glossary terms arrive in the same
 * `tags` array with `source === 'Glossary'` and are split out here so
 * the two columns can render them separately (pin's `TableTags` does
 * the same split by its `type` prop).
 */
export interface LineageTableRow {
  id: string;
  name: string;
  displayName: string;
  fullyQualifiedName: string;
  entityType: string;
  description: string;
  domains: LineageTableEntityRef[];
  owners: LineageTableEntityRef[];
  tier?: string;
  tags: LineageTableTag[];
  glossaryTerms: LineageTableTag[];
  nodeDepth: number;
  upstreamCount?: number;
  downstreamCount?: number;
}

function splitTagSources(tags: LineageTableTag[]): { tags: LineageTableTag[]; glossaryTerms: LineageTableTag[] } {
  return {
    tags: tags.filter((tag) => tag.source !== 'Glossary'),
    glossaryTerms: tags.filter((tag) => tag.source === 'Glossary'),
  };
}

function mapEntityToRow(
  entity: Record<string, unknown>,
  nodeDepth: number,
  paging: Record<string, unknown> | null,
): LineageTableRow {
  const allTags = parseTags(entity.tags);
  const { tags, glossaryTerms } = splitTagSources(allTags);
  const tier = parseTier(entity.tier);
  const upstream = paging?.entityUpstreamCount;
  const downstream = paging?.entityDownstreamCount;
  return {
    id: asString(entity.id),
    name: asString(entity.name),
    displayName: asString(entity.displayName) || asString(entity.name),
    fullyQualifiedName: asString(entity.fullyQualifiedName),
    entityType: asString(entity.type) || asString(entity.entityType),
    description: asString(entity.description),
    domains: parseEntityRefs(entity.domains),
    owners: parseEntityRefs(entity.owners),
    ...(tier ? { tier } : {}),
    tags,
    glossaryTerms,
    nodeDepth,
    ...(typeof upstream === 'number' ? { upstreamCount: upstream } : {}),
    ...(typeof downstream === 'number' ? { downstreamCount: downstream } : {}),
  };
}

export interface LineageDepthCount {
  depth: number;
  entityCount: number;
}

/** Pin `LineagePagingInfo` (interface/lineage.interface.ts:149). */
export interface LineagePaginationInfo {
  downstreamDepthInfo: LineageDepthCount[];
  upstreamDepthInfo: LineageDepthCount[];
  maxDownstreamDepth: number;
  maxUpstreamDepth: number;
  totalDownstreamEntities: number;
  totalUpstreamEntities: number;
}

function parseDepthCounts(value: unknown): LineageDepthCount[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const depth = rec.depth;
    const entityCount = rec.entityCount;
    if (typeof depth !== 'number' || typeof entityCount !== 'number') {
      return [];
    }
    return [{ depth, entityCount }];
  });
}

function parseCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function parseLineagePaginationInfo(value: unknown): LineagePaginationInfo | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  return {
    downstreamDepthInfo: parseDepthCounts(rec.downstreamDepthInfo),
    upstreamDepthInfo: parseDepthCounts(rec.upstreamDepthInfo),
    maxDownstreamDepth: parseCount(rec.maxDownstreamDepth),
    maxUpstreamDepth: parseCount(rec.maxUpstreamDepth),
    totalDownstreamEntities: parseCount(rec.totalDownstreamEntities),
    totalUpstreamEntities: parseCount(rec.totalUpstreamEntities),
  };
}

export interface LineageEntityCountResult {
  rows: LineageTableRow[];
  paginationInfo: LineagePaginationInfo | null;
}

/**
 * Parse a `getLineageByEntityCount` response. The center node is dropped
 * (pin `delete res.nodes[fqn]`) and rows are sorted by nodeDepth
 * ascending (pin `sortBy(..., 'nodeDepth')`). Rows without an id and
 * without a fullyQualifiedName are skipped — there is nothing to link
 * or key them by, and a row must never be invented.
 */
export function parseLineageEntityCountResponse(payload: unknown, centerFqn: string): LineageEntityCountResult {
  const root = asRecord(payload) ?? {};
  const nodesMap = asRecord(root.nodes) ?? {};
  const rows: LineageTableRow[] = [];
  for (const [key, item] of Object.entries(nodesMap)) {
    if (key === centerFqn) {
      continue;
    }
    const info = asRecord(item) ?? {};
    const entity = asRecord(info.entity);
    if (!entity) {
      continue;
    }
    const nodeDepth = typeof info.nodeDepth === 'number' ? info.nodeDepth : 0;
    const row = mapEntityToRow(entity, nodeDepth, asRecord(info.paging));
    if (!row.id && !row.fullyQualifiedName) {
      continue;
    }
    rows.push(row);
  }
  rows.sort((a, b) => a.nodeDepth - b.nodeDepth);
  return { rows, paginationInfo: parseLineagePaginationInfo(root.paginationInfo) };
}

// ---------------------------------------------------------------------------
// Column level (pin utils/Lineage/LineagePureUtils.ts)
// ---------------------------------------------------------------------------

export interface LineageTableColumnRow {
  /** Pin `docId`: `fromColumn->toColumn`, the column-level row key. */
  docId: string;
  fromEntity: LineageTableEntityRef;
  toEntity: LineageTableEntityRef;
  fromColumn?: string;
  toColumn?: string;
  nodeDepth: number;
  /** Trailing table columns, taken from the direction-side entity. */
  name: string;
  displayName: string;
  fullyQualifiedName: string;
  entityType: string;
  description: string;
  domains: LineageTableEntityRef[];
  owners: LineageTableEntityRef[];
  tier?: string;
  tags: LineageTableTag[];
  glossaryTerms: LineageTableTag[];
}

interface ParsedColumnEdge {
  fromEntity: LineageTableEntityRef;
  toEntity: LineageTableEntityRef;
  columns: Array<{ fromColumns: string[]; toColumn: string; function?: string }>;
  description?: string;
  source?: string;
}

function parseColumnEdge(value: unknown): ParsedColumnEdge | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const fromEntity = parseEntityRef(rec.fromEntity);
  const toEntity = parseEntityRef(rec.toEntity);
  if (!fromEntity.fullyQualifiedName && !fromEntity.id) {
    return null;
  }
  if (!toEntity.fullyQualifiedName && !toEntity.id) {
    return null;
  }
  const columns = Array.isArray(rec.columns)
    ? rec.columns.flatMap((item) => {
        const col = asRecord(item);
        if (!col) {
          return [];
        }
        const toColumn = asString(col.toColumn);
        const fromColumns = Array.isArray(col.fromColumns)
          ? col.fromColumns.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
          : [];
        if (!toColumn && fromColumns.length === 0) {
          return [];
        }
        const fn = asString(col.function);
        return [{ fromColumns, toColumn, function: fn || undefined }];
      })
    : [];
  return {
    fromEntity,
    toEntity,
    columns,
    description: asString(rec.description) || undefined,
    source: asString(rec.source) || undefined,
  };
}

/**
 * Column tags keyed by column FQN, from an entity's (possibly nested)
 * columns — pin `buildColumnTagMap`. Nested columns recurse so a struct
 * column's children contribute their tags too.
 */
function buildColumnTagMap(entityData: Record<string, unknown>): Map<string, LineageTableTag[]> {
  const map = new Map<string, LineageTableTag[]>();
  const columns = entityData.columns;
  if (!Array.isArray(columns)) {
    return map;
  }
  for (const item of columns) {
    const col = asRecord(item);
    if (!col) {
      continue;
    }
    if (Array.isArray(col.children)) {
      for (const [fqn, tags] of buildColumnTagMap({ columns: col.children })) {
        map.set(fqn, tags);
      }
    }
    const fqn = asString(col.fullyQualifiedName);
    if (fqn) {
      map.set(fqn, parseTags(col.tags));
    }
  }
  return map;
}

interface SearchNodeInfo {
  entity?: Record<string, unknown>;
  nodeDepth: number;
}

/**
 * Expand search edges into per-column rows — pin
 * `prepareColumnLevelNodesFromEdges` (+ the upstream/downstream
 * wrappers). The entity fields trailing each row come from the
 * direction-side entity: downstream reads the `toEntity`, upstream the
 * `fromEntity` (`entityKey` in pin). Edges with no column mappings, and
 * edges whose direction-side entity is missing from the nodes map, yield
 * no rows. `columnFqn` is the impacted column downstream, the source
 * column upstream, and its tags become the row's tags.
 */
export function prepareColumnLevelNodesFromEdges(
  edges: unknown[],
  nodes: Record<string, SearchNodeInfo>,
  direction: LineageTableDirection,
): LineageTableColumnRow[] {
  const entityKey = direction === 'Upstream' ? 'fromEntity' : 'toEntity';
  const rows: LineageTableColumnRow[] = [];
  for (const rawEdge of edges) {
    const edge = parseColumnEdge(rawEdge);
    if (!edge || edge.columns.length === 0) {
      continue;
    }
    const sideEntity = edge[entityKey];
    const info = nodes[sideEntity.fullyQualifiedName];
    const entityData = info?.entity;
    if (!entityData) {
      continue;
    }
    const nodeDepth = info?.nodeDepth ?? 0;
    const picked = mapEntityToRow(entityData, nodeDepth, null);
    const columnTagMap = buildColumnTagMap(entityData);
    for (const col of edge.columns) {
      for (const fromCol of col.fromColumns) {
        const columnFqn = direction === 'Downstream' ? col.toColumn : fromCol;
        const columnTags = columnFqn ? columnTagMap.get(columnFqn) ?? [] : [];
        const { tags, glossaryTerms } = splitTagSources(columnTags);
        rows.push({
          docId: `${fromCol}->${col.toColumn}`,
          fromEntity: edge.fromEntity,
          toEntity: edge.toEntity,
          fromColumn: fromCol,
          toColumn: col.toColumn,
          nodeDepth,
          name: picked.name,
          displayName: picked.displayName,
          fullyQualifiedName: picked.fullyQualifiedName,
          entityType: picked.entityType,
          description: picked.description,
          domains: picked.domains,
          owners: picked.owners,
          ...(picked.tier ? { tier: picked.tier } : {}),
          tags,
          glossaryTerms,
        });
      }
    }
  }
  return rows;
}

/**
 * Column-level rows from a `searchLineage` (`getLineageDataByFQN`)
 * payload: the directional edge map plus the nodes map. No sorting —
 * pin slices the rows in fetch order for client-side paging.
 */
export function columnLevelNodesFromSearchLineage(
  payload: unknown,
  direction: LineageTableDirection,
): LineageTableColumnRow[] {
  const root = asRecord(payload) ?? {};
  const edgesMap = asRecord(direction === 'Upstream' ? root.upstreamEdges : root.downstreamEdges) ?? {};
  const nodesMap = asRecord(root.nodes) ?? {};
  const nodes: Record<string, SearchNodeInfo> = {};
  for (const [key, item] of Object.entries(nodesMap)) {
    const info = asRecord(item) ?? {};
    nodes[key] = {
      entity: asRecord(info.entity) ?? undefined,
      nodeDepth: typeof info.nodeDepth === 'number' ? info.nodeDepth : 0,
    };
  }
  return prepareColumnLevelNodesFromEdges(Object.values(edgesMap), nodes, direction);
}

// ---------------------------------------------------------------------------
// Quick-filter split (pin LineageTable.tsx queryFilter / columnFilterValue)
// ---------------------------------------------------------------------------

/**
 * Which quick-filter keys go to `column_filter` instead of the
 * `query_filter` JSON. Table level: only COLUMN (and pin's
 * CustomControls hides the Column picker at table level, so in practice
 * no column filter is sent). Column level: COLUMN, TAG and GLOSSARY —
 * the product's quick filters have no glossary key (L2 residual), so
 * only COLUMN and TAG are reachable here.
 */
export function columnFilterKeysFor(level: LineageImpactLevel): LineageQuickFilterKey[] {
  return level === 'column' ? ['column', 'tag'] : ['column'];
}

/** Pin `getSearchNameEsQuery` (LineagePureUtils.ts): wildcard on `name.keyword` / `displayName.keyword`. */
export function getSearchNameEsQuery(searchText: string): Record<string, unknown> {
  return {
    bool: {
      should: [
        { wildcard: { 'name.keyword': { value: `*${searchText}*` } } },
        { wildcard: { 'displayName.keyword': { value: `*${searchText}*` } } },
      ],
    },
  };
}

/**
 * The `query_filter` JSON for the impact fetch. Table-level filters
 * (everything except the column-filter keys) come from L2's
 * `buildLineageQueryFilter`; the search term is added as a name
 * wildcard ONLY at table level (pin: at column level the search term
 * goes to `column_filter` as `columnName:`). Returns undefined when
 * nothing filters — pin passes `JSON.stringify(undefined)`, which the
 * client omits, and the product's apiRequest skips undefined the same
 * way.
 */
export function buildImpactQueryFilter(
  selections: readonly LineageQuickFilterSelection[],
  searchValue: string,
  level: LineageImpactLevel,
): string | undefined {
  const columnKeys = columnFilterKeysFor(level);
  const tableLevel = selections.filter((selection) => !columnKeys.includes(selection.key));
  const base = buildLineageQueryFilter(tableLevel);
  const must: unknown[] = [];
  if (base) {
    try {
      const parsed = JSON.parse(base) as { query?: { bool?: { must?: unknown[] } } };
      const clauses = parsed?.query?.bool?.must;
      if (Array.isArray(clauses)) {
        must.push(...clauses);
      }
    } catch {
      // buildLineageQueryFilter only ever returns its own JSON; a parse
      // failure here would mean that builder changed shape — drop the
      // filter rather than sending a malformed query.
    }
  }
  if (searchValue && level === 'table') {
    must.push(getSearchNameEsQuery(searchValue));
  }
  if (must.length === 0) {
    return undefined;
  }
  return JSON.stringify({ query: { bool: { must } } });
}

/**
 * The `column_filter` string for the impact fetch. Undefined at table
 * level (pin returns early there); at column level each selected
 * column/tag value plus the search term as `columnName:`. Format:
 * `columnName:val1,columnName:val2,tag:PII`.
 */
export function buildImpactColumnFilter(
  selections: readonly LineageQuickFilterSelection[],
  searchValue: string,
  level: LineageImpactLevel,
): string | undefined {
  if (level === 'table') {
    return undefined;
  }
  const filters: string[] = [];
  for (const selection of selections) {
    if (!columnFilterKeysFor(level).includes(selection.key)) {
      continue;
    }
    for (const value of selection.values) {
      if (selection.key === 'column') {
        filters.push(`columnName:${value}`);
      } else if (selection.key === 'tag') {
        filters.push(`tag:${value}`);
      }
    }
  }
  if (searchValue) {
    filters.push(`columnName:${searchValue}`);
  }
  return filters.length > 0 ? filters.join(',') : undefined;
}

// ---------------------------------------------------------------------------
// Direction counts, depth options, URL params
// ---------------------------------------------------------------------------

/**
 * Pin's direction counts (LineageTable.tsx `upstreamCount` /
 * `downstreamCount`): per-depth entity counts summed for depths 1..nodeDepth;
 * depth-0 rows (the center) are never shown in the table, so they are
 * never counted.
 */
export function countImpactDirectionTotals(
  pagingInfo: LineagePaginationInfo | null,
  nodeDepth: number,
): { upstreamCount: number; downstreamCount: number } {
  const sum = (info: LineageDepthCount[]): number =>
    info.reduce((acc, record) => (record.depth > nodeDepth || record.depth === 0 ? acc : acc + record.entityCount), 0);
  return {
    upstreamCount: pagingInfo ? sum(pagingInfo.upstreamDepthInfo) : 0,
    downstreamCount: pagingInfo ? sum(pagingInfo.downstreamDepthInfo) : 0,
  };
}

/** Pin's `nodeDepthOptions`: the depths the paging info reports for the current direction. */
export function depthOptionsFromPagingInfo(
  pagingInfo: LineagePaginationInfo | null,
  direction: LineageTableDirection,
): number[] {
  if (!pagingInfo) {
    return [];
  }
  const info = direction === 'Upstream' ? pagingInfo.upstreamDepthInfo : pagingInfo.downstreamDepthInfo;
  return info.map((record) => record.depth);
}

export interface LineageTableUrlParams {
  direction: LineageTableDirection;
  nodeDepth: number;
  currentPage: number;
  pageSize: number;
}

function parsePageSize(value: unknown): number {
  const size = typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(size) && LIST_PAGE_SIZE_OPTIONS.includes(size) ? size : PAGE_SIZE_BASE;
}

/**
 * Pin's URL params (LineageTable.tsx `useMemo` on `location.search`):
 * `dir` is Upstream only when literally `Upstream`, anything else is
 * Downstream; `depth` falls back to the directional config depth when
 * absent or not a number. `currentPage` / `pageSize` follow pin's
 * `usePaging` (pageSize reconciled to the [15, 25, 50] options).
 */
export function parseLineageTableUrlParams(
  query: Record<string, unknown>,
  upstreamDepth: number,
  downstreamDepth: number,
): LineageTableUrlParams {
  const direction: LineageTableDirection = query.dir === 'Upstream' ? 'Upstream' : 'Downstream';
  const directionalDepth = direction === 'Upstream' ? upstreamDepth : downstreamDepth;
  const rawDepth = typeof query.depth === 'string' ? Number(query.depth) : NaN;
  const nodeDepth = Number.isNaN(rawDepth) || rawDepth < 0 ? directionalDepth : Math.trunc(rawDepth);
  const rawPage = typeof query.currentPage === 'string' ? Number(query.currentPage) : NaN;
  const currentPage = Number.isFinite(rawPage) && rawPage >= 1 ? Math.trunc(rawPage) : 1;
  return { direction, nodeDepth, currentPage, pageSize: parsePageSize(query.pageSize) };
}

/** Pin `EntityLineageTab`: `?mode=impact_analysis` renders the table, anything else the diagram. */
export function isImpactAnalysisMode(query: Record<string, unknown>): boolean {
  return query.mode === 'impact_analysis';
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Last FQN segment, quote-aware like pin's `Fqn.split(column).pop()`. */
export function lastFqnSegment(fqn: string): string {
  if (!fqn) {
    return '';
  }
  const parts = splitFqn(fqn);
  return parts.length > 0 ? parts[parts.length - 1] ?? '' : fqn;
}
