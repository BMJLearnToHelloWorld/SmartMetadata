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
