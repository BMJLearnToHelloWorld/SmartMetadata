/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mapSearchResponse } from '@/catalog/searchHits';
import { asNumber, asRecord, asString } from '@/api/json';
import type { SearchPage } from '@/types/api';
import type { SearchSettings } from '@/types/admin';
import { apiRequest } from './client';
import { mapQuerySearchPage, type QuerySearchPage } from './queries';

export interface SearchAssetsOptions {
  index?: string;
  includeAggregations?: boolean;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  /**
   * Official GET search surface (searchAPI rawSearchQuery): the showDeleted
   * flag travels as `deleted`. Only true is sent, so existing requests that
   * do not opt in are byte-identical to before.
   */
  deleted?: boolean;
  /**
   * Explore D12 ranking details: pin's ExploreUtils sends
   * `explain: showRankingDetails` on both search payloads, and pin's
   * axios client serializes the boolean as given (`false` becomes
   * `explain=false`); the parameter is omitted only when the option is
   * absent, so existing requests stay byte-identical. With it the
   * server returns each hit's `_explanation` and `matched_queries`,
   * which `mapSearchResponse` carries onto the hit.
   */
  explain?: boolean;
  /**
   * ADR:2026-11-07-context-center-search-query-filter-is-a-json-string —
   * the server's `query_filter` is a String, and apiRequest only carries
   * string | number | boolean query values, so callers pass the already
   * serialized JSON string (JSON.stringify of the filter object). An
   * object passed here would arrive as "[object Object]".
   */
  query_filter?: string;
  /**
   * Official search request parameters (ExploreUtils fetchEntityData /
   * runResultsSearch). Each is sent only when the caller opts in, so
   * existing callers stay byte-identical: Explore passes all three on
   * its results search. `excludeSourceFields` travels as repeated
   * `exclude_source_fields` params (see apiRequest array values).
   */
  trackTotalHits?: boolean;
  excludeSourceFields?: string[];
}

/**
 * Official Explore `excludeSourceFields` (ExploreUtils.ts:193,316):
 * heavy source fields the Explore list never renders. Without
 * `trackTotalHits` Elasticsearch caps the reported total at 10000
 * (ExploreUtils.ts:311-312).
 */
export const SEARCH_EXCLUDE_SOURCE_FIELDS = ['columns', 'queries', 'columnNames', 'dataModel'] as const;

/** Official `MAX_RESULT_HITS` (explore.constants.ts:27): the ES total cap. */
export const MAX_RESULT_HITS = 10000;

/**
 * Official AGGREGATE_PAGE_SIZE_LARGE (constants.ts): a terms
 * aggregation cannot page, so the whole candidate set is read up to
 * this cap. Named, never a magic number at the call site.
 */
export const AGGREGATE_PAGE_SIZE_LARGE = 1000;

/**
 * Official AggregationRequest (generated/search/aggregationRequest.ts):
 * the body for POST /v1/search/aggregate, with an optional top_hits
 * sub-aggregation. `deleted` is nullable on purpose: incident
 * documents carry no top-level `deleted`, so the server default
 * (`deleted: false`) would match zero rows — the incident assignee
 * call passes `deleted: null`.
 */
export interface AggregationTopHits {
  size?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc' | 'Asc' | 'Desc';
}

export interface AggregationRequest {
  deleted?: boolean | null;
  fieldName: string;
  fieldValue?: string;
  index?: string;
  query?: string;
  queryText?: string;
  size?: number;
  sourceFields?: string[];
  topHits?: AggregationTopHits;
}

/** One terms bucket; the top_hits sub-aggregation carries the latest document per bucket. */
export interface AggregationBucket {
  key?: string | number;
  doc_count?: number;
  'top_hits#top'?: {
    hits?: {
      hits?: Array<{ _source?: Record<string, unknown> }>;
    };
  };
}

export interface AggregateResponse {
  aggregations?: Record<string, { buckets?: AggregationBucket[] }>;
}

/**
 * Official escapeESReservedCharacters (utils/StringUtils.ts), verbatim:
 * backslash-escapes every Elasticsearch reserved character so a
 * field value can be wrapped in a `.*...*` include pattern.
 */
export const ES_RESERVED_CHARACTERS: Record<string, string> = {
  '+': String.raw`\+`,
  '-': String.raw`\-`,
  '=': String.raw`\=`,
  '&': String.raw`\&`,
  '|': String.raw`\|`,
  '>': String.raw`\>`,
  '<': String.raw`\<`,
  '!': String.raw`\!`,
  '(': String.raw`\(`,
  ')': String.raw`\)`,
  '{': String.raw`\{`,
  '}': String.raw`\}`,
  '[': String.raw`\[`,
  ']': String.raw`\]`,
  '^': String.raw`\^`,
  '"': String.raw`\"`,
  '~': String.raw`\~`,
  '*': String.raw`\*`,
  '?': String.raw`\?`,
  ':': String.raw`\:`,
  '\\': String.raw`\\`,
  '/': String.raw`\/`,
};

export const escapeESReservedCharacters = (text?: string): string => {
  const reUnescapedHtml = /[\\[\]#+=&|><!(){}^"~*?:/-]/g;
  const reHasUnescapedHtml = new RegExp(reUnescapedHtml.source);
  const getReplacedChar = (char: string): string => ES_RESERVED_CHARACTERS[char] ?? char;
  return text && reHasUnescapedHtml.test(text)
    ? text.replaceAll(reUnescapedHtml, getReplacedChar)
    : (text ?? '');
};

/**
 * Official postAggregateFieldOptions (rest/miscAPI.ts), verbatim: wraps
 * the filter value as `.*<escaped>.*` (or `.*` when empty) and POSTs
 * the body as given otherwise. No exact-match variant is needed in
 * this batch.
 * ADR:2026-11-08-incident-assignee-aggregate-candidates
 */
export async function postAggregateFieldOptions(body: AggregationRequest): Promise<AggregateResponse> {
  const { fieldValue, ...rest } = body;
  const withWildCardValue = fieldValue ? `.*${escapeESReservedCharacters(fieldValue)}.*` : '.*';
  return apiRequest<AggregateResponse>('/v1/search/aggregate', {
    method: 'POST',
    json: { fieldValue: withWildCardValue, ...rest },
  });
}

export interface NlqSearchOptions {
  index?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  deleted?: boolean;
  /**
   * Already-serialized query_filter JSON (same convention as
   * SearchAssetsOptions): the D11 NLQ path forwards the Explore
   * query_filter, as pin's nlqSearch does.
   */
  query_filter?: string;
  /**
   * Explore D12: pin's ExploreUtils sends `explain: showRankingDetails`
   * on the NLQ payload too (the same payload object feeds both the
   * keyword and the NLQ request), serialized as given like the keyword
   * payload (`false` becomes `explain=false`).
   */
  explain?: boolean;
}

/**
 * Natural-language search. The official UI calls /hybrid/nlq/search, but
 * this snapshot's server exposes no /hybrid route; the verified equivalent
 * is GET /v1/search/nlq/query, whose parameters match the UI call one to
 * one (q, index, size, from, deleted, sort_field, sort_order)
 * and whose response is the same SearchResponse shape, so
 * the keyword mapper is reused. A live /hybrid probe may one day justify
 * a one-line switch; it does not block this wiring.
 */
export async function nlqSearch(
  query: string,
  from = 0,
  size = 10,
  options: NlqSearchOptions = {},
): Promise<SearchPage> {
  const payload = await apiRequest<unknown>('/v1/search/nlq/query', {
    query: {
      q: query,
      index: options.index ?? 'dataAsset',
      from,
      size,
      sort_field: options.sortField,
      sort_order: options.sortOrder,
      deleted: options.deleted === true ? true : undefined,
      explain: options.explain,
      query_filter: options.query_filter,
    },
  });
  return mapSearchResponse(payload);
}

/** Official getNLPEnabledStatus (rest/searchAPI.ts): GET /system/search/nlq. */
export async function getNLPEnabledStatus(): Promise<boolean> {
  const payload = await apiRequest<unknown>('/v1/system/search/nlq');
  return payload === true;
}

export async function searchAssets(
  query: string,
  from = 0,
  size = 20,
  options: SearchAssetsOptions = {},
): Promise<SearchPage> {
  const q = query.trim().length > 0 ? query.trim() : '*';
  const payload = await apiRequest<unknown>('/v1/search/query', {
    query: {
      q,
      index: options.index ?? 'dataAsset',
      from,
      size,
      include_aggregations: options.includeAggregations ?? true,
      sort_field: options.sortField,
      sort_order: options.sortOrder,
      deleted: options.deleted === true ? true : undefined,
      query_filter: options.query_filter,
      track_total_hits: options.trackTotalHits,
      explain: options.explain,
      exclude_source_fields: options.excludeSourceFields,
    },
  });
  return mapSearchResponse(payload);
}

export interface EntityTypeCountsRequest {
  /** Raw user query; empty means match-all, as on the server. */
  query: string;
  /** Indexes to count across, e.g. every Explore tab index. */
  index: string[];
  queryFilter?: string;
  postFilter?: string;
  deleted?: boolean;
  includeTopHit?: boolean;
}

/**
 * Official `rest/searchAPI.ts searchEntityTypeCounts` (searchAPI.ts:218-240):
 * GET /v1/search/entityTypeCounts. The fork's server exposes the same
 * operation (`SearchResource.getEntityTypeCounts`, operationId
 * `getEntityTypeCounts`): `q`, comma-joined `index`, `query_filter`,
 * `post_filter`, `deleted`, `include_top_hit`. The response is a
 * SearchResponse whose `entityType` aggregation carries one bucket per
 * type with hits; read it with `entityTypeCountsFromPage`.
 */
export async function searchEntityTypeCounts(
  request: EntityTypeCountsRequest,
): Promise<SearchPage> {
  const payload = await apiRequest<unknown>('/v1/search/entityTypeCounts', {
    query: {
      q: request.query,
      index: request.index.join(','),
      query_filter: request.queryFilter,
      post_filter: request.postFilter,
      deleted: request.deleted === true ? true : undefined,
      include_top_hit: request.includeTopHit,
    },
  });
  return mapSearchResponse(payload);
}

/**
 * Official `ExploreUtils.applyHitCounts`: the counts response's
 * `entityType` aggregation buckets, keyed by entity type. A type with
 * no bucket has zero hits for the query.
 */
export function entityTypeCountsFromPage(page: SearchPage): Map<string, number> {
  const counts = new Map<string, number>();
  const facet = page.facets.find((item) => item.id === 'entityType');
  for (const bucket of facet?.buckets ?? []) {
    counts.set(bucket.key, bucket.count);
  }
  return counts;
}

/**
 * Field-value aggregation, mirroring official rest/miscAPI.ts
 * postAggregateFieldOptions / postExactAggregateFieldOptions against POST
 * /v1/search/aggregate (operationId aggregateSearchRequest, body
 * AggregationRequest). The wildcard variant wraps fieldValue as
 * `.*<escaped>.*` (or `'.*'` when absent) for substring matching; the
 * exact variant posts the body as given — no `.*` wrapping, which would
 * break an alternation of exact terms. The POST is the operation the
 * frontend calls; the GET /v1/search/aggregate is getAggregateFields
 * (query params), a different operation.
 * ADR:2026-11-08-my-data-thin-clients-aggregate-post
 */
export interface AggregateFieldOptionsRequest {
  query?: string;
  index?: string;
  fieldName: string;
  fieldValue?: string;
  deleted?: boolean | null;
  size?: number;
  sourceFields?: string[];
  queryText?: string;
  topHits?: { size?: number; sortField?: string; sortOrder?: 'asc' | 'desc' };
}

export interface AggregateBucket {
  key: string;
  docCount: number;
}

function toAggregateBody(request: AggregateFieldOptionsRequest): Record<string, unknown> {
  return {
    query: request.query,
    index: request.index,
    fieldName: request.fieldName,
    fieldValue: request.fieldValue,
    deleted: request.deleted ?? undefined,
    size: request.size,
    sourceFields: request.sourceFields,
    queryText: request.queryText,
    topHits: request.topHits,
  };
}

export function postExactAggregateFieldOptions(
  request: AggregateFieldOptionsRequest,
): Promise<unknown> {
  return apiRequest<unknown>('/v1/search/aggregate', {
    method: 'POST',
    json: toAggregateBody(request),
  });
}

/**
 * Official miscAPI.ts getAggregations: the response nests buckets under
 * `aggregations['sterms#<field>'].buckets` with `{key, doc_count}` rows.
 * The `sterms#` prefix is stripped and only the requested field's
 * buckets are returned.
 */
export function mapAggregateBuckets(payload: unknown, fieldName: string): AggregateBucket[] {
  const aggregations = asRecord(asRecord(payload)?.aggregations);
  if (!aggregations) {
    return [];
  }
  for (const [rawName, rawNode] of Object.entries(aggregations)) {
    const name = rawName.startsWith('sterms#') ? rawName.slice('sterms#'.length) : rawName;
    if (name !== fieldName) {
      continue;
    }
    const node = asRecord(rawNode);
    if (!node || !Array.isArray(node.buckets)) {
      return [];
    }
    return node.buckets.flatMap((item) => {
      const rec = asRecord(item);
      if (!rec) {
        return [];
      }
      const key = typeof rec.key === 'string' ? rec.key : rec.key !== undefined ? String(rec.key) : '';
      return key ? [{ key, docCount: asNumber(rec.doc_count) ?? 0 }] : [];
    });
  }
  return [];
}

export interface SearchQueriesOptions {
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  /** Already-serialized createQueryFilter JSON (see SearchAssetsOptions). */
  query_filter?: string;
}

/**
 * Pin TableQueries list call: GET /v1/search/query with index=query, the
 * same endpoint and parameters searchAssets sends, but a Query-field-
 * preserving mapper — mapSearchResponse drops every Query-specific field
 * (query text, date, duration, votes, queryUsedIn, users, usedBy), so the
 * tab needs this call instead of sharing the generic one. searchAssets
 * and mapSearchResponse are unchanged for all other callers.
 */
export async function searchQueries(
  query: string,
  from = 0,
  size = 15,
  options: SearchQueriesOptions = {},
): Promise<QuerySearchPage> {
  const q = query.trim().length > 0 ? query.trim() : '*';
  const payload = await apiRequest<unknown>('/v1/search/query', {
    query: {
      q,
      index: 'query',
      from,
      size,
      sort_field: options.sortField,
      sort_order: options.sortOrder,
      query_filter: options.query_filter,
    },
  });
  return mapQuerySearchPage(payload);
}

/** Official rest/searchAPI.ts SearchIndexFailureRecord. */
export interface SearchIndexFailureRecord {
  id: string;
  jobId: string;
  runId: string;
  entityType: string;
  entityId?: string;
  entityFqn?: string;
  failureStage: string;
  errorMessage?: string;
  stackTrace?: string;
  timestamp: number;
}

export interface ReindexFailuresResponse {
  data: SearchIndexFailureRecord[];
  total: number;
  offset: number;
  limit: number;
}

export interface GetReindexFailuresParams {
  offset?: number;
  limit?: number;
  entityType?: string;
}

function mapSearchIndexFailureRecord(value: unknown): SearchIndexFailureRecord | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  return {
    id: asString(rec.id),
    jobId: asString(rec.jobId),
    runId: asString(rec.runId),
    entityType: asString(rec.entityType),
    ...(asString(rec.entityId) ? { entityId: asString(rec.entityId) } : {}),
    ...(asString(rec.entityFqn) ? { entityFqn: asString(rec.entityFqn) } : {}),
    failureStage: asString(rec.failureStage),
    ...(asString(rec.errorMessage) ? { errorMessage: asString(rec.errorMessage) } : {}),
    ...(asString(rec.stackTrace) ? { stackTrace: asString(rec.stackTrace) } : {}),
    timestamp: asNumber(rec.timestamp) ?? 0,
  };
}

/**
 * Official rest/searchAPI.ts getReindexFailures: GET /v1/search/reindex/failures.
 * Pin defaults offset=0, limit=50; an empty entityType is omitted.
 */
export async function getReindexFailures(
  params: GetReindexFailuresParams = {},
): Promise<ReindexFailuresResponse> {
  const { offset = 0, limit = 50, entityType } = params;
  const raw = await apiRequest<unknown>('/v1/search/reindex/failures', {
    query: { offset, limit, ...(entityType ? { entityType } : {}) },
  });
  const rec = asRecord(raw);
  const rows = Array.isArray(rec?.data) ? rec.data : [];
  return {
    data: rows.flatMap((row) => {
      const mapped = mapSearchIndexFailureRecord(row);
      return mapped ? [mapped] : [];
    }),
    total: asNumber(rec?.total) ?? 0,
    offset: asNumber(rec?.offset) ?? offset,
    limit: asNumber(rec?.limit) ?? limit,
  };
}

/**
 * Official rest/searchAPI.ts getSearchEntityTypes: GET /v1/search/entityTypes.
 * Entity types that have a search index in this deployment, sorted and
 * server-driven, so the entity picker also lists distribution-specific types.
 */
export async function getSearchEntityTypes(): Promise<string[]> {
  const raw = await apiRequest<unknown>('/v1/search/entityTypes');
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [];
}

export interface PreviewSearchHit {
  id: string;
  score?: number;
  source: Record<string, unknown>;
  highlight?: Record<string, string[]>;
  explanation?: unknown;
  matchedQueries?: string[];
}

export interface PreviewSearchResult {
  hits: PreviewSearchHit[];
  total: number;
}

export interface PreviewSearchPayload {
  from: number;
  size: number;
  index: string;
  query: string;
  queryFilter: string;
  explain: boolean;
  searchSettings: SearchSettings;
}

export function mapPreviewSearchResponse(payload: unknown): PreviewSearchResult {
  const root = asRecord(payload);
  const hitsNode = asRecord(root?.hits);
  const totalNode = asRecord(hitsNode?.total);
  const rawHits = Array.isArray(hitsNode?.hits) ? hitsNode.hits : [];
  const hits: PreviewSearchHit[] = rawHits.flatMap((raw) => {
    const hit = asRecord(raw);
    if (!hit) {
      return [];
    }
    const source = asRecord(hit._source) ?? {};
    const highlightNode = asRecord(hit.highlight);
    const highlight: Record<string, string[]> | undefined = highlightNode
      ? Object.fromEntries(
          Object.entries(highlightNode)
            .filter(([, value]) => Array.isArray(value))
            .map(([key, value]) => [
              key,
              (value as unknown[]).map((fragment) => String(fragment)),
            ]),
        )
      : undefined;
    return [
      {
        id: asString(hit._id) || asString(source.id) || '',
        score: asNumber(hit._score),
        source,
        highlight,
        explanation: hit._explanation,
        matchedQueries: Array.isArray(hit.matched_queries)
          ? hit.matched_queries.map((query) => String(query))
          : undefined,
      },
    ];
  });
  return { hits, total: asNumber(totalNode?.value) ?? 0 };
}

/**
 * Official `rest/searchAPI.searchPreview` (searchAPI.ts:208): POST the
 * preview payload to /v1/search/preview. Official returns the raw
 * SearchResponse; the product parses it through
 * mapPreviewSearchResponse so the preview pane consumes typed hits.
 */
export async function searchPreview(
  payload: PreviewSearchPayload,
): Promise<PreviewSearchResult> {
  const response = await apiRequest<unknown>('/v1/search/preview', {
    method: 'POST',
    json: payload,
  });
  return mapPreviewSearchResponse(response);
}
