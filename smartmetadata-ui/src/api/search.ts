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

export async function searchAssets(query: string, from = 0, size = 20): Promise<SearchPage> {
  const q = query.trim().length > 0 ? query.trim() : '*';
  const payload = await apiRequest<unknown>('/v1/search/query', {
    query: {
      q,
      index: 'dataAsset',
      from,
      size,
      include_aggregations: false,
    },
  });
  return mapSearchResponse(payload);
}
