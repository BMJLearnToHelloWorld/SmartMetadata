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
    },
  });
  return mapSearchResponse(payload);
}
