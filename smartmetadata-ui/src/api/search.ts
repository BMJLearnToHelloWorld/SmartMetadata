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
import { asNumber, asRecord } from '@/api/json';
import type { SearchPage } from '@/types/api';
import { apiRequest } from './client';

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
   * ADR:2026-11-07-context-center-search-query-filter-is-a-json-string —
   * the server's `query_filter` is a String, and apiRequest only carries
   * string | number | boolean query values, so callers pass the already
   * serialized JSON string (JSON.stringify of the filter object). An
   * object passed here would arrive as "[object Object]".
   */
  query_filter?: string;
}

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
    },
  });
  return mapSearchResponse(payload);
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

/**
 * Official StringUtils.ts escapeESReservedCharacters: every reserved
 * character maps to backslash + itself, looked up one character at a
 * time. `#` is in the regex class but has no map entry, so it passes
 * through unchanged — mirrored here, not "fixed".
 */
const ES_RESERVED_CHARACTERS: Record<string, string> = {
  '+': '\\+',
  '-': '\\-',
  '=': '\\=',
  '&': '\\&',
  '|': '\\|',
  '>': '\\>',
  '<': '\\<',
  '!': '\\!',
  '(': '\\(',
  ')': '\\)',
  '{': '\\{',
  '}': '\\}',
  '[': '\\[',
  ']': '\\]',
  '^': '\\^',
  '"': '\\"',
  '~': '\\~',
  '*': '\\*',
  '?': '\\?',
  ':': '\\:',
  '\\': '\\\\',
  '/': '\\/',
};

const ES_RESERVED_CHARACTERS_REGEX = /[\\[\]#+=&|><!(){}^"~*?:/-]/g;

export function escapeESReservedCharacters(text?: string): string {
  if (!text) {
    return '';
  }
  return text.replaceAll(
    ES_RESERVED_CHARACTERS_REGEX,
    (char) => ES_RESERVED_CHARACTERS[char] ?? char,
  );
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

export function postAggregateFieldOptions(
  request: AggregateFieldOptionsRequest,
): Promise<unknown> {
  const { fieldValue, ...rest } = request;
  const withWildCardValue = fieldValue ? `.*${escapeESReservedCharacters(fieldValue)}.*` : '.*';
  return apiRequest<unknown>('/v1/search/aggregate', {
    method: 'POST',
    json: toAggregateBody({ ...rest, fieldValue: withWildCardValue }),
  });
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
      return key ? [{ key, docCount: asNumber(rec.doc_count) }] : [];
    });
  }
  return [];
}
