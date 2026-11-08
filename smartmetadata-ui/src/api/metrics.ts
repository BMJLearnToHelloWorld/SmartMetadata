/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { apiRequest } from './client';
import { notifyCsvJobsRefresh } from './csvJobs';
import { asNumber, asRecord, asString, mapEntityRefs, parsePaged } from './json';
import { mapTags } from './entities';
import type { Paged } from '@/types/admin';
import type { EntityRef, TagRef } from '@/types/api';

/**
 * Official deleteMetricAsync (rest/metricsAPI.ts): metric deletion is async —
 * DELETE /metrics/async/{id} starts a job; there is no synchronous delete
 * surface. The product has no metric-job tracking surface, so callers must
 * present this as "async delete submitted", never as "deleted".
 *
 * ADR:2026-11-07-metrics-delete-recursive-default-true — the official
 * function defaults `recursive` to false and its only call site passes
 * true; the product defaults it to true because every product caller
 * (detail single delete now, list bulk delete in Wave 2) must delete
 * recursively, and a forgotten argument must fail safe towards the
 * recursive soft delete the A-D5 decision requires, not towards a
 * `metric is not empty` rejection. Call sites still pass `true`
 * explicitly so the intent is visible at the call, not hidden in the
 * default. Wave 2 bulk delete: only top-level selected metrics are
 * deleted, each with `recursive=true`, and the UI says "delete
 * submitted", never "deleted".
 */
export function deleteMetricAsync(id: string, recursive = true): Promise<unknown> {
  return apiRequest(`/v1/metrics/async/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { recursive },
  });
}

/**
 * Official EntityStatus values, verbatim
 * (generated/api/data/createDataContract.ts): the InReview member's value
 * is "In Review" with a space. Never hand-write "InReview" as a filter
 * term — the search index stores the spaced value and the term would
 * match nothing.
 */
export const METRIC_STATUS_VALUES = [
  'Approved',
  'Archived',
  'Deprecated',
  'Draft',
  'In Review',
  'Rejected',
  'Unprocessed',
] as const;

export type MetricStatus = (typeof METRIC_STATUS_VALUES)[number];

/**
 * Official getTermQuery({ entityStatus }) shape (utils/SearchPureUtils):
 * each term is `{ term: { [field]: value } }` under `query.bool.must`.
 * Same shape as the product's buildAdminUserQueryFilter precedent. The
 * caller passes the already-serialized JSON string because the server's
 * `query_filter` is a String and apiRequest would stringify a bare
 * object to "[object Object]"
 * (ADR:2026-11-07-context-center-search-query-filter-is-a-json-string).
 */
export function buildMetricStatusQueryFilter(status: string): string {
  return JSON.stringify({
    query: { bool: { must: [{ term: { entityStatus: status } }] } },
  });
}

/**
 * Metric entity as returned by GET /v1/metrics (MetricResource list,
 * fields '*' in the bulk-edit loader). Only the fields the bulk-edit grid
 * reads are mapped; the rest of the entity is never needed client-side
 * for a CSV round-trip, and the CSV columns come from the metric CSV
 * documentation, not from this shape.
 *
 * `childrenCount` is the tree expand-button signal (official
 * MetricHierarchyUtils.hasMetricChildren: childrenCount > 0 shows the
 * expander); it is requested through METRIC_LIST_FIELDS, never derived
 * from the FQN, because metric FQNs are flat.
 */
export interface Metric {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName: string;
  metricType?: string;
  unitOfMeasurement?: string;
  customUnitOfMeasurement?: string;
  granularity?: string;
  expressionLanguage?: string;
  expressionCode?: string;
  entityStatus?: string;
  childrenCount?: number;
  parent?: EntityRef;
  metricGroup?: EntityRef;
  owners: EntityRef[];
  reviewers: EntityRef[];
  domains: EntityRef[];
  dataProducts: EntityRef[];
  relatedMetrics: EntityRef[];
  experts: EntityRef[];
  tags: TagRef[];
  extension?: Record<string, unknown>;
}

/**
 * Metric Group as returned inside a hierarchy item (generated/entity/
 * data/metricGroup.ts). `metricCount` is computed on read by the server
 * and never stored; the group banner shows
 * `group.metricCount ?? group.metrics?.length`.
 */
export interface MetricGroup {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName: string;
  entityStatus?: string;
  metricCount?: number;
  metrics?: Metric[];
  owners: EntityRef[];
  domains: EntityRef[];
  tags: TagRef[];
}

export function mapMetricGroup(raw: unknown): MetricGroup | null {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  const id = asString(rec.id);
  const name = asString(rec.name);
  const fullyQualifiedName = asString(rec.fullyQualifiedName);
  if (!id || !name || !fullyQualifiedName) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(rec.displayName) || undefined,
    description: asString(rec.description) || undefined,
    fullyQualifiedName,
    entityStatus: asString(rec.entityStatus) || undefined,
    metricCount: asNumber(rec.metricCount),
    metrics: Array.isArray(rec.metrics)
      ? rec.metrics.flatMap((item) => {
          const mapped = mapMetric(item);
          return mapped ? [mapped] : [];
        })
      : undefined,
    owners: mapEntityRefs(rec.owners),
    domains: mapEntityRefs(rec.domains),
    tags: mapTags(rec.tags),
  };
}

/**
 * Top-level hierarchy entry (schema api/data/metricHierarchyItem.json):
 * kind is `metricGroup` or `metric` (lower camel), oneOf-bound to its
 * side — a group item carries `group` and no `metric`, a metric item
 * carries `metric` and no `group`.
 */
export type MetricHierarchyItemKind = 'metricGroup' | 'metric';

export interface MetricHierarchyItem {
  kind: MetricHierarchyItemKind;
  group?: MetricGroup;
  metric?: Metric;
}

/**
 * Maps one hierarchy item. An unknown `kind` — or a known kind whose
 * payload side is missing — throws instead of being skipped: the
 * official hook throws on an invalid kind (useMetricHierarchy), and a
 * silently dropped top-level entry would hide a group or a root metric
 * from the tree without any trace.
 */
export function mapMetricHierarchyItem(raw: unknown): MetricHierarchyItem {
  const rec = asRecord(raw);
  const kind = asString(rec?.kind);
  if (kind === 'metricGroup') {
    const group = mapMetricGroup(rec?.group);
    if (!group) {
      throw new Error('Metric hierarchy item of kind metricGroup is missing its group');
    }
    return { kind, group };
  }
  if (kind === 'metric') {
    const metric = mapMetric(rec?.metric);
    if (!metric) {
      throw new Error('Metric hierarchy item of kind metric is missing its metric');
    }
    return { kind, metric };
  }
  throw new Error(`Invalid metric hierarchy item: ${kind || '(missing kind)'}`);
}

export interface ListMetricsQuery {
  limit?: number;
  after?: string;
  before?: string;
  fields?: string;
  include?: string;
  /**
   * Official getMetrics (rest/metricsAPI.ts): omit for every metric,
   * pass the literal string 'null' for root metrics only, or pass a
   * parent metric's fully qualified name for its immediate children.
   */
  parent?: string;
  entityStatus?: string;
}

const METRIC_LIST_FIELDS =
  'owners,reviewers,domains,dataProducts,relatedMetrics,experts,tags,parent,metricGroup,extension,metricExpression,childrenCount';

/** Tree child fields (official useMetricHierarchy METRIC_TREE_FIELDS). */
export const METRIC_TREE_FIELDS = 'owners,tags,domains,parent,childrenCount,metricGroup';

export function mapMetric(raw: unknown): Metric | null {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  const id = asString(rec.id);
  const name = asString(rec.name);
  const fullyQualifiedName = asString(rec.fullyQualifiedName);
  if (!id || !name || !fullyQualifiedName) {
    return null;
  }
  const expression = asRecord(rec.metricExpression);
  const parentRefs = mapEntityRefs(rec.parent ? [rec.parent] : []);
  const groupRefs = mapEntityRefs(rec.metricGroup ? [rec.metricGroup] : []);
  return {
    id,
    name,
    displayName: asString(rec.displayName) || undefined,
    description: asString(rec.description) || undefined,
    fullyQualifiedName,
    metricType: asString(rec.metricType) || undefined,
    unitOfMeasurement: asString(rec.unitOfMeasurement) || undefined,
    customUnitOfMeasurement: asString(rec.customUnitOfMeasurement) || undefined,
    granularity: asString(rec.granularity) || undefined,
    expressionLanguage: asString(expression?.language) || undefined,
    expressionCode: asString(expression?.code) || undefined,
    entityStatus: asString(rec.entityStatus) || undefined,
    childrenCount: asNumber(rec.childrenCount),
    parent: parentRefs[0],
    metricGroup: groupRefs[0],
    owners: mapEntityRefs(rec.owners),
    reviewers: mapEntityRefs(rec.reviewers),
    domains: mapEntityRefs(rec.domains),
    dataProducts: mapEntityRefs(rec.dataProducts),
    relatedMetrics: mapEntityRefs(rec.relatedMetrics),
    experts: mapEntityRefs(rec.experts),
    tags: mapTags(rec.tags),
    extension: asRecord(rec.extension) ?? undefined,
  };
}

/**
 * Official getMetrics (rest/metricsAPI.ts): GET /v1/metrics with limit /
 * after paging. The bulk-edit loader pages with limit 1000 and fields '*'
 * semantics via METRIC_LIST_FIELDS; callers that only need names pass
 * their own fields value.
 */
export async function listMetrics(query: ListMetricsQuery = {}): Promise<Paged<Metric>> {
  const payload = await apiRequest<unknown>('/v1/metrics', {
    query: {
      fields: query.fields ?? METRIC_LIST_FIELDS,
      limit: query.limit ?? 1000,
      after: query.after,
      before: query.before,
      include: query.include,
      parent: query.parent,
      entityStatus: query.entityStatus,
    },
  });
  return parsePaged(payload, mapMetric);
}

export interface MetricHierarchyQuery {
  limit?: number;
  offset?: number;
  q?: string;
}

/**
 * Official getMetricHierarchy (rest/metricsAPI.ts): GET /v1/metrics/
 * hierarchy, offset-paged, optional case-insensitive name search `q`.
 */
export async function getMetricHierarchy(
  query: MetricHierarchyQuery = {},
): Promise<Paged<MetricHierarchyItem>> {
  const payload = await apiRequest<unknown>('/v1/metrics/hierarchy', {
    query: {
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      q: query.q,
    },
  });
  return parsePaged(payload, mapMetricHierarchyItem);
}

export interface MetricGroupMetricsQuery {
  limit?: number;
  offset?: number;
  q?: string;
  rootOnly?: boolean;
}

/**
 * Official getMetricGroupMetrics (rest/metricGroupsAPI.ts): GET
 * /v1/metricGroups/{id}/metrics. `rootOnly=true` lists only the group's
 * root metrics (variants stay under their parents); the id is the group
 * id, not its FQN.
 */
export async function getMetricGroupMetrics(
  id: string,
  query: MetricGroupMetricsQuery = {},
): Promise<Paged<Metric>> {
  const payload = await apiRequest<unknown>(`/v1/metricGroups/${encodeURIComponent(id)}/metrics`, {
    query: {
      fields: METRIC_LIST_FIELDS,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      q: query.q,
      rootOnly: query.rootOnly,
    },
  });
  return parsePaged(payload, mapMetric);
}

/** Official getMetricByFqn (rest/metricsAPI.ts): GET /v1/metrics/name/{fqn}. */
export async function getMetricByFqn(fqn: string, fields?: string): Promise<Metric> {
  const payload = await apiRequest<unknown>(`/v1/metrics/name/${encodeURIComponent(fqn)}`, {
    query: { fields },
  });
  const metric = mapMetric(payload);
  if (!metric) {
    throw new Error('Metric response was missing id, name, or fully qualified name');
  }
  return metric;
}

/**
 * Create Metric request (generated/api/data/createMetric.ts). Only the
 * fields the Wave 2 create drawer sends are listed; dimensions/measures
 * are detail-page capabilities and are not creation fields.
 *
 * Wave 2 drawer constraints, recorded here so the drawer reuses them
 * instead of re-deciding them: `metricGroup` is never set at creation
 * (official AddMetricForm.utils.ts:55 — a group is an independent API
 * field, children inherit their parent's group); `parent` takes the
 * parent metric's fully qualified name.
 */
export interface CreateMetric {
  name: string;
  displayName?: string;
  description?: string;
  metricType?: string;
  granularity?: string;
  unitOfMeasurement?: string;
  customUnitOfMeasurement?: string;
  metricExpression?: { language?: string; code?: string };
  owners?: EntityRef[];
  reviewers?: EntityRef[];
  domains?: string[];
  dataProducts?: string[];
  relatedMetrics?: string[];
  experts?: string[];
  tags?: TagRef[];
  parent?: string;
  metricGroup?: string;
}

/** Official createMetric (rest/metricsAPI.ts): POST /v1/metrics. No UI calls it yet (Wave 2 drawer). */
export async function createMetric(data: CreateMetric): Promise<Metric> {
  const payload = await apiRequest<unknown>('/v1/metrics', { method: 'POST', json: data });
  const metric = mapMetric(payload);
  if (!metric) {
    throw new Error('Create metric response was missing id, name, or fully qualified name');
  }
  return metric;
}

/**
 * Official exportMetricDetailsInCSV (rest/metricsAPI.ts): GET
 * /v1/metrics/name/{fqn}/exportAsync. The list export passes the literal
 * fqn '*'; callers pass a real FQN for a single-metric export. On
 * success the CSV jobs tray is told to refresh, so the job appears even
 * if the tray has not polled yet. No UI calls it yet (Wave 2 export
 * wiring). The product has no markCsvJobOwned equivalent — whether the
 * "completed job is always shown" semantic needs one is a Wave 2
 * decision, not this batch's.
 */
export async function exportMetricsCsvAsync(fqn: string): Promise<unknown> {
  const payload = await apiRequest<unknown>(
    `/v1/metrics/name/${encodeURIComponent(fqn)}/exportAsync`,
  );
  notifyCsvJobsRefresh();
  return payload;
}

/** Official getCustomUnitsOfMeasurement: GET /v1/metrics/customUnits. */
export async function getCustomUnitsOfMeasurement(): Promise<string[]> {
  const payload = await apiRequest<unknown>('/v1/metrics/customUnits');
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.filter((item): item is string => typeof item === 'string');
}

/**
 * Server-computed health rollup (generated/api/data/metricObservability.
 * ts): `health` is the overall band — Unknown when no upstream asset
 * carries a data quality test — and `score` is absent when health is
 * Unknown. Only the fields the health column renders are mapped; the
 * per-asset/per-test breakdown stays server-side.
 */
export type MetricHealth = 'AtRisk' | 'Degraded' | 'Healthy' | 'Unknown';

export interface MetricObservability {
  health: MetricHealth;
  score?: number;
  evaluatedAt?: number;
  reasonCode?: string;
  rollupReason?: string;
  evaluatedAssetCount?: number;
  upstreamAssetCount?: number;
}

const METRIC_HEALTH_VALUES: readonly string[] = ['AtRisk', 'Degraded', 'Healthy', 'Unknown'];

function mapMetricObservability(raw: unknown): MetricObservability {
  const rec = asRecord(raw) ?? {};
  const health = asString(rec.health);
  return {
    health: (METRIC_HEALTH_VALUES as readonly string[]).includes(health)
      ? (health as MetricHealth)
      : 'Unknown',
    score: asNumber(rec.score),
    evaluatedAt: asNumber(rec.evaluatedAt),
    reasonCode: asString(rec.reasonCode) || undefined,
    rollupReason: asString(rec.rollupReason) || undefined,
    evaluatedAssetCount: asNumber(rec.evaluatedAssetCount),
    upstreamAssetCount: asNumber(rec.upstreamAssetCount),
  };
}

/** Official getMetricObservability (rest/metricsAPI.ts): GET /v1/metrics/{id}/observability. */
export async function getMetricObservability(id: string): Promise<MetricObservability> {
  const payload = await apiRequest<unknown>(`/v1/metrics/${encodeURIComponent(id)}/observability`);
  return mapMetricObservability(payload);
}

// ---------------------------------------------------------------------------
// Tree search paths (official rest/metricsAPI.ts getMetricSearchPaths /
// getMetricParentIds). The search response mapper drops the parent link,
// so these read `_source` directly instead of going through searchAssets:
// the hierarchy search needs each hit's direct parent id, and the flat
// list never does.
// ---------------------------------------------------------------------------

const METRIC_SEARCH_PATH_PAGE_SIZE = 100;
const METRIC_SEARCH_PATH_MAX_DEPTH = 6;

interface MetricSearchDoc {
  id: string;
  parent?: { id?: string; fullyQualifiedName?: string };
}

function readMetricSearchDocs(payload: unknown): { docs: MetricSearchDoc[]; total: number } {
  const root = asRecord(payload);
  const hitsNode = asRecord(root?.hits);
  const totalNode = hitsNode?.total;
  const total =
    typeof totalNode === 'number'
      ? totalNode
      : typeof asRecord(totalNode)?.value === 'number'
        ? (asRecord(totalNode)?.value as number)
        : 0;
  if (!hitsNode || !Array.isArray(hitsNode.hits)) {
    return { docs: [], total };
  }
  const docs: MetricSearchDoc[] = [];
  for (const raw of hitsNode.hits) {
    const hit = asRecord(raw);
    const source = asRecord(hit?._source) ?? {};
    const id = asString(source.id) || asString(hit?._id);
    if (!id) {
      continue;
    }
    const parent = asRecord(source.parent);
    docs.push({
      id,
      parent: parent
        ? {
            id: asString(parent.id) || undefined,
            fullyQualifiedName: asString(parent.fullyQualifiedName) || undefined,
          }
        : undefined,
    });
  }
  return { docs, total };
}

async function searchMetricDocs(
  query: string,
  queryFilter?: Record<string, unknown>,
): Promise<{ docs: MetricSearchDoc[]; total: number }> {
  const payload = await apiRequest<unknown>('/v1/search/query', {
    query: {
      q: query.trim().length > 0 ? query.trim() : '*',
      index: 'dataAsset',
      from: 0,
      size: METRIC_SEARCH_PATH_PAGE_SIZE,
      query_filter: queryFilter ? JSON.stringify(queryFilter) : undefined,
    },
  });
  return readMetricSearchDocs(payload);
}

function termQueryShould(ids: string[]): Record<string, unknown> {
  return {
    query: {
      bool: {
        should: ids.map((id) => ({ term: { 'id.keyword': id } })),
        minimum_should_match: 1,
      },
    },
  };
}

/**
 * Official getMetricSearchPaths: the matches for `query` plus every
 * metric on their parent chains (walked at most 6 levels, 100 docs per
 * level). The tree expands the ancestor branches and — only when the
 * walk completed — filters children to those branches; an incomplete
 * walk must show children unfiltered, or a match the server found could
 * become unreachable.
 */
export async function getMetricSearchPaths(query: string): Promise<{
  matchIds: Set<string>;
  ancestorIds: Set<string>;
  complete: boolean;
}> {
  const { docs: matches, total } = await searchMetricDocs(query);
  const matchIds = new Set(matches.map(({ id }) => id));
  const ancestorIds = new Set<string>();
  let level = matches;
  let depth = 0;
  while (level.length > 0 && depth < METRIC_SEARCH_PATH_MAX_DEPTH) {
    const parentIds = [
      ...new Set(
        level.flatMap(({ parent }) => (parent?.id ? [parent.id] : [])),
      ),
    ].filter((id) => !ancestorIds.has(id));
    parentIds.forEach((id) => ancestorIds.add(id));
    const parentDocs = parentIds.length > 0
      ? await searchMetricDocs('', termQueryShould(parentIds))
      : undefined;
    level = parentDocs?.docs ?? [];
    depth += 1;
  }
  return {
    matchIds,
    ancestorIds,
    complete: matches.length > 0 && total <= METRIC_SEARCH_PATH_PAGE_SIZE && level.length === 0,
  };
}

/**
 * Official getMetricParentIds: parent links for metrics that are not
 * loaded on the page, walked up from `ids` at most 6 levels with one
 * search per level. The index stores only each metric's direct parent.
 * Built for the Wave 2 bulk delete (top-level-only selection); no UI
 * calls it yet.
 */
export async function getMetricParentIds(ids: string[]): Promise<Map<string, string>> {
  const parentIdById = new Map<string, string>();
  let level = ids;
  let depth = 0;
  while (level.length > 0 && depth < METRIC_SEARCH_PATH_MAX_DEPTH) {
    const levelFilter = termQueryShould(level);
    const { docs } = await searchMetricDocs('', levelFilter);
    const next: string[] = [];
    for (const doc of docs) {
      if (doc.parent?.id && !parentIdById.has(doc.id)) {
        parentIdById.set(doc.id, doc.parent.id);
        next.push(doc.parent.id);
      }
    }
    level = next;
    depth += 1;
  }
  return parentIdById;
}

/**
 * Ancestor fully qualified names for one metric, root first, walked at
 * most 6 levels through GET /v1/metrics/name/{fqn}?fields=parent. Used
 * by the list's ?highlight=<fqn> handling to expand the ancestor chain
 * before scrolling. A lookup failure yields the chain found so far (the
 * caller scrolls silently or not at all); it never throws.
 */
export async function getMetricAncestorFqns(fqn: string): Promise<string[]> {
  const chain: string[] = [];
  let current = fqn;
  try {
    for (let depth = 0; depth < METRIC_SEARCH_PATH_MAX_DEPTH; depth += 1) {
      const metric = await getMetricByFqn(current, 'parent');
      const parentFqn = metric.parent?.fullyQualifiedName;
      if (!parentFqn) {
        break;
      }
      chain.push(parentFqn);
      current = parentFqn;
    }
  } catch {
    // A missing metric or a failed hop leaves the partial chain; the
    // highlight caller treats "no row found" as silent, not an error.
  }
  return chain.reverse();
}
