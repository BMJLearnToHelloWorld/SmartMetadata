/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RestClient } from './client.js';
import { fitCount, serializedLength } from './budget.js';
import { clampInt } from './limits.js';

/**
 * Vector search over POST /v1/search/vector/query, shared by the
 * semantic-search tools. The vector index carries chunk documents and
 * applies no access policy of its own; the REST endpoint filters to what
 * the caller may view, and this module cleans each hit down to the
 * entity-level fields a caller can act on.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */

export const VECTOR_SIZE_DEFAULT = 10;
export const VECTOR_SIZE_MAX = 50;
export const VECTOR_K_DEFAULT = 100;
export const VECTOR_K_MAX = 10_000;
export const VECTOR_THRESHOLD_MIN = 0;
export const VECTOR_THRESHOLD_MAX = 1;

/** Filter keys the vector query builder understands, under `filters`. */
export const VECTOR_FILTER_FIELDS = [
  'entityType',
  'service',
  'serviceType',
  'tags',
  'owners',
  'domains',
  'tier',
  'certification',
  'database',
  'databaseSchema',
  'primaryEntityId',
  'parentId',
  'metricType',
  'granularity',
  'unitOfMeasurement',
] as const;

export const CUSTOM_PROPERTIES_PREFIX = 'customProperties.';

export interface VectorSearchParams {
  query: string;
  filters?: Record<string, string[]>;
  size?: number;
  from?: number;
  k?: number;
  threshold?: number;
}

export interface VectorSearchResponse {
  tookMillis?: number;
  hits?: Array<Record<string, unknown>>;
  totalHits?: number | null;
  hasMore?: boolean | null;
}

export async function searchVector(
  client: RestClient,
  params: VectorSearchParams,
): Promise<VectorSearchResponse> {
  const body: Record<string, unknown> = {
    query: params.query,
    filters: params.filters ?? {},
    size: clampInt(params.size, 1, VECTOR_SIZE_MAX, VECTOR_SIZE_DEFAULT),
    from: Math.max(0, Math.trunc(params.from ?? 0)),
    // The server defaults k to 1000; the tool contract defaults it to 100.
    // Always send it explicitly, never rely on the server default.
    k: clampInt(params.k, 1, VECTOR_K_MAX, VECTOR_K_DEFAULT),
    threshold: Math.min(
      VECTOR_THRESHOLD_MAX,
      Math.max(VECTOR_THRESHOLD_MIN, params.threshold ?? 0),
    ),
  };
  return client.request<VectorSearchResponse>('/v1/search/vector/query', {
    method: 'POST',
    json: body,
  });
}

/**
 * Reject the two ways a filter used to be discarded in silence: passed at
 * the top level instead of under `filters`, or named something the query
 * builder does not understand. Either way the caller got an unfiltered
 * search back with no indication their filter had done nothing.
 */
export function validateSemanticSearchParams(
  query: string | undefined,
  params: Record<string, unknown>,
  filters: Record<string, unknown> | undefined,
): string | null {
  if (!query?.trim()) {
    return "'query' parameter is required";
  }
  const misplaced = VECTOR_FILTER_FIELDS.find((field) => field in params);
  if (misplaced) {
    return (
      `'${misplaced}' is a filter and must be nested under 'filters' as an array, ` +
      `for example: {"query": "...", "filters": {"${misplaced}": ["value"]}}`
    );
  }
  const unknown = Object.keys(filters ?? {}).find(
    (key) => !VECTOR_FILTER_FIELDS.includes(key as (typeof VECTOR_FILTER_FIELDS)[number]) && !key.startsWith(CUSTOM_PROPERTIES_PREFIX),
  );
  if (unknown) {
    return (
      `'${unknown}' is not a supported filter field. Supported fields: ` +
      `${VECTOR_FILTER_FIELDS.join(', ')}, or 'customProperties.<name>'.`
    );
  }
  return null;
}

/** Description length above which the search tools truncate. */
export const DESCRIPTION_MAX_LENGTH = 500;
/** Where an over-length description is cut, below the threshold. */
export const DESCRIPTION_TRUNCATE_LENGTH = 450;
/** Read-side ceiling on the metric expression a summary carries. */
export const MAX_METRIC_CODE_CHARS = 1000;
/** Column names per hit, matching search_metadata. */
export const MAX_COLUMN_NAMES = 60;

export function truncateDescription(value: string): string {
  if (value.length > DESCRIPTION_MAX_LENGTH) {
    return value.slice(0, DESCRIPTION_TRUNCATE_LENGTH) + '...';
  }
  return value;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) + '...' : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Collapse an entity-reference-shaped map to the one field a caller can act
 * on: its FQN. Anything not reference-shaped is returned untouched, rather
 * than silently emptied. A single quoted segment (e.g. `"vishnu.jain"`) is
 * unquoted: the quotes only separate segments inside a multi-part FQN.
 */
export function slimRef(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const fqn = value.fullyQualifiedName ?? value.name;
  if (fqn === undefined || fqn === null) {
    return value;
  }
  const name = String(fqn);
  const unquoted =
    name.length > 1 && name.startsWith('"') && name.endsWith('"') && name.indexOf('"', 1) === name.length - 1
      ? name.slice(1, -1)
      : name;
  return unquoted + (value.inherited === true ? ' (inherited)' : '');
}

export function slimRefs(value: unknown): unknown {
  return Array.isArray(value) ? value.map((ref) => slimRef(ref)) : value;
}

/** Collapse a tag-label-shaped map to its tagFQN. */
export function slimTag(value: unknown): unknown {
  if (isRecord(value) && value.tagFQN !== undefined && value.tagFQN !== null) {
    return value.tagFQN;
  }
  if (Array.isArray(value)) {
    return value.map((tag) => slimTag(tag));
  }
  return value;
}

/**
 * Collapse a certification to its FQN plus a resolved validity. The nested
 * label repeats a description, colour and icon URL on every certified hit,
 * and expiry ships as raw epoch millis next to `state: "Confirmed"`, so a
 * lapsed badge would read as a live trust signal without this.
 */
export function slimCertification(value: unknown, nowMillis = Date.now()): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const label = value.tagLabel;
  const tag = isRecord(label) ? label : value;
  const fqn = tag.tagFQN;
  if (fqn === undefined || fqn === null) {
    return value;
  }
  const expiry = expiryOf(value, tag);
  let suffix: string;
  if (typeof expiry === 'number') {
    const date = new Date(expiry).toISOString().slice(0, 10);
    suffix = expiry < nowMillis ? ` (EXPIRED ${date})` : ` (valid until ${date})`;
  } else {
    // Some documents carry only {tagLabel:{tagFQN}}; a bare label reads as a
    // live badge, so say the date exists, just not in this projection.
    suffix = ' (expiry not in this index - check get_entity_details before trusting)';
  }
  return `${String(fqn)}${suffix}`;
}

function expiryOf(
  certification: Record<string, unknown>,
  tag: Record<string, unknown>,
): unknown {
  if (certification.expiryDate !== undefined && certification.expiryDate !== null) {
    return certification.expiryDate;
  }
  const metadata = tag.metadata;
  if (isRecord(metadata) && metadata.expiryDate !== undefined && metadata.expiryDate !== null) {
    return metadata.expiryDate;
  }
  return tag.expiryDate ?? null;
}

/**
 * One result per entity, best-scoring chunk first. The vector service pages
 * by parent entity but returns every matching chunk of each parent; since
 * cleaning keeps only entity-level fields, the extra chunks of one entity
 * clean down to near-identical rows. Collapsing makes the returned count
 * equal the parent count, which is what the cursor arithmetic assumes.
 */
export function collapseByParent(
  hits: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byParent = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    const parentId = hit.parentId;
    const fqn = hit.fullyQualifiedName;
    const key =
      parentId !== undefined && parentId !== null
        ? String(parentId)
        : fqn !== undefined && fqn !== null
          ? String(fqn)
          : `hit:${i}`;
    if (!byParent.has(key)) {
      byParent.set(key, cleanVectorHit(hit));
    }
  }
  return [...byParent.values()];
}

/** The entity-level fields a vector hit keeps; everything else is bulk. */
export function cleanVectorHit(hit: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  const copyIfPresent = (field: string) => {
    if (hit[field] !== undefined && hit[field] !== null) {
      cleaned[field] = hit[field];
    }
  };
  const copySlim = (field: string, slim: (value: unknown) => unknown) => {
    if (hit[field] !== undefined && hit[field] !== null) {
      cleaned[field] = slim(hit[field]);
    }
  };
  copyIfPresent('parentId');
  copyIfPresent('entityType');
  copyIfPresent('fullyQualifiedName');
  copyIfPresent('name');
  copyIfPresent('displayName');
  copyIfPresent('serviceType');
  copySlim('service', slimRef);
  copySlim('database', slimRef);
  copySlim('databaseSchema', slimRef);
  copySlim('owners', slimRefs);
  copySlim('domains', slimRefs);
  copySlim('tier', slimTag);
  copySlim('tags', slimTag);
  copyColumnNames(hit, cleaned);
  copySlim('certification', (value) => slimCertification(value));
  // A metric summary without its expression, granularity, type and unit
  // cannot be told apart from a similarly named metric.
  copyMetricExpression(hit, cleaned);
  copyIfPresent('metricType');
  copyIfPresent('granularity');
  copyIfPresent('unitOfMeasurement');
  resolveCustomUnit(hit, cleaned);
  if (hit._score !== undefined && hit._score !== null) {
    cleaned.similarityScore = hit._score;
  }
  if (hit.description !== undefined && hit.description !== null) {
    cleaned.description =
      typeof hit.description === 'string' ? truncateDescription(hit.description) : hit.description;
  }
  return cleaned;
}

/**
 * Column names, not full column objects: full `columns` was most of a 10-hit
 * response, and names still answer "does this table have a customer_id
 * column?"; get_entity_details stays the way to get the detail.
 */
function copyColumnNames(
  hit: Record<string, unknown>,
  cleaned: Record<string, unknown>,
): void {
  if (Array.isArray(hit.columns) && hit.columns.length > 0) {
    const names = hit.columns
      .slice(0, MAX_COLUMN_NAMES)
      .map((column) => (isRecord(column) ? column.name : undefined))
      .filter((name): name is string => typeof name === 'string');
    cleaned.columnNames = names;
  }
}

/**
 * The write-side cap only covers chunk docs. Entity documents carry the
 * untruncated expression, and on Elasticsearch, which has no chunk index,
 * every hit is an entity document — so the read side caps it too.
 */
function copyMetricExpression(
  hit: Record<string, unknown>,
  cleaned: Record<string, unknown>,
): void {
  if (isRecord(hit.metricExpression)) {
    const summary: Record<string, unknown> = { ...hit.metricExpression };
    if (typeof summary.code === 'string') {
      summary.code = truncate(summary.code, MAX_METRIC_CODE_CHARS);
    }
    cleaned.metricExpression = summary;
  }
}

/**
 * A hit from an entity index carries the raw `OTHER` sentinel plus a
 * separate `customUnitOfMeasurement`, while a chunk doc already stores the
 * resolved unit. Resolving it here keeps the two doc types
 * indistinguishable to the caller.
 */
function resolveCustomUnit(
  hit: Record<string, unknown>,
  cleaned: Record<string, unknown>,
): void {
  const customUnit = hit.customUnitOfMeasurement;
  if (cleaned.unitOfMeasurement === 'OTHER' && customUnit !== undefined && customUnit !== null) {
    cleaned.unitOfMeasurement = customUnit;
  }
}

/**
 * `totalFound` in the same unit as everything else here: entities.
 * `totalHits` counts chunks, not entities — the vector service indexes
 * several chunks per entity — so report what is known: once paging stops,
 * `from + returnedCount` is exact; while it continues, the same figure is
 * a lower bound and is labelled as one.
 */
export function addParentTotal(result: Record<string, unknown>, from: number): void {
  const returned = typeof result.returnedCount === 'number' ? result.returnedCount : 0;
  result.totalFound = from + returned;
  if (result.hasMore === true) {
    result.totalFoundIsLowerBound = true;
    result.totalFoundNote =
      "'totalFound' counts the entities seen so far, not the whole corpus - more exist. " +
      "Page with 'nextCursor' until 'hasMore' is absent to get the exact count.";
  }
}

/**
 * Keep the response under the dispatch-level size cap by returning fewer
 * results (never mangling the ones kept). Returns whether the list was cut.
 */
export function fitResultsToBudget(
  result: Record<string, unknown>,
  results: Array<Record<string, unknown>>,
  noun = 'results',
): boolean {
  const saved = result.results;
  delete result.results;
  const overhead = serializedLength(result);
  result.results = saved;
  const fit = fitCount(results, overhead);
  if (fit < results.length) {
    const trimmed = results.slice(0, fit);
    result.results = trimmed;
    result.returnedCount = trimmed.length;
    result.hasMore = true;
    result.message =
      `Returning ${trimmed.length} of ${results.length} ${noun} to stay within the response size budget. ` +
      'Refine the query or lower \'size\' for a smaller response.';
    return true;
  }
  return false;
}

/**
 * Ranked hits this page used up: all of them, unless the response budget
 * kept fewer hits than there were — then the ones up to the last hit kept.
 * The cursor advances by this count, in parent units: the vector service
 * pages by parent entity, so `from` is a parent offset.
 */
export function consumedThrough(rankedCount: number, kept: number): number {
  if (kept < rankedCount) {
    return kept;
  }
  return rankedCount;
}

/** Fields the metric attach reads per metric (parent, children, group). */
export const METRIC_HIERARCHY_FIELDS = 'parent,childrenCount,metricGroup';
/** Bound on metric reads per tool call: the attach must not fan out. */
export const MAX_METRIC_ATTACH = 10;

export interface MetricHierarchy {
  parent?: Record<string, unknown>;
  childrenCount?: number;
  metricGroup?: Record<string, unknown>;
}

function isMetricHit(hit: Record<string, unknown>): boolean {
  return hit.entityType === 'metric' && hit.fullyQualifiedName !== undefined && hit.fullyQualifiedName !== null;
}

/**
 * Attach each metric hit's hierarchy, read through the same
 * GET /v1/metrics/name/{fqn} path get_entity_details uses. The reads go out
 * as one bounded batch: at most MAX_METRIC_ATTACH metrics per call, and a
 * failed read degrades to no attach fields for that metric — never a whole
 * batch failure. Any degradation is stated in the result, never silent.
 *
 * `slim` controls the shape: semantic_search collapses the parent and group
 * to their FQNs, while find_context keeps the full reference objects.
 */
export async function attachMetricHierarchy(
  client: RestClient,
  hits: Array<Record<string, unknown>>,
  result: Record<string, unknown>,
  options: { slim?: boolean } = {},
): Promise<void> {
  const slim = options.slim ?? true;
  const metricHits = hits.filter(isMetricHit);
  if (metricHits.length === 0) {
    return;
  }
  const capped = metricHits.slice(0, MAX_METRIC_ATTACH);
  const settled = await Promise.allSettled(
    capped.map((hit) =>
      client.getByFqn<Record<string, unknown>>('/v1/metrics/name', String(hit.fullyQualifiedName), {
        fields: METRIC_HIERARCHY_FIELDS,
      }),
    ),
  );
  let degraded = metricHits.length > MAX_METRIC_ATTACH;
  settled.forEach((outcome, index) => {
    const hit = capped[index];
    if (hit === undefined) {
      degraded = true;
      return;
    }
    if (outcome.status === 'fulfilled') {
      const metric = outcome.value;
      if (isRecord(metric.parent)) {
        hit.parent = slim ? slimRef(metric.parent) : metric.parent;
      }
      if (typeof metric.childrenCount === 'number') {
        hit.childrenCount = metric.childrenCount;
      }
      if (isRecord(metric.metricGroup)) {
        hit.metricGroup = slim ? slimRef(metric.metricGroup) : metric.metricGroup;
      }
    } else {
      degraded = true;
    }
  });
  if (degraded) {
    result.metricHierarchyNote =
      'Some metric hits carry no parent/childrenCount/metricGroup: the hierarchy read failed or ' +
      `the call carries more than ${MAX_METRIC_ATTACH} metric hits. Call get_entity_details for the full metric.`;
  }
}
