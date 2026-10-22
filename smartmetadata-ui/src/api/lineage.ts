/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { encodeFqnForApi } from '@/catalog/entityRoutes';
import {
  clampLineageDepth,
  LINEAGE_DEPTH_DEFAULT,
} from '@/lineage/depth';
import { apiRequest } from './client';

export interface FetchEntityLineageOptions {
  entityType: string;
  fqn: string;
  upstreamDepth?: number;
  downstreamDepth?: number;
}

/**
 * GET /v1/lineage/{entity}/name/{fqn} — EntityLineage with depth 0–3.
 * Does not call the search-backed /getLineage endpoints.
 */
export async function fetchEntityLineage(options: FetchEntityLineageOptions): Promise<unknown> {
  const entityType = options.entityType.trim();
  const fqn = options.fqn.trim();
  if (!entityType) {
    throw new Error('Lineage requires an entity type');
  }
  if (!fqn) {
    throw new Error('Lineage requires an FQN');
  }
  return apiRequest<unknown>(`/v1/lineage/${encodeURIComponent(entityType)}/name/${encodeFqnForApi(fqn)}`, {
    query: {
      upstreamDepth: clampLineageDepth(options.upstreamDepth ?? LINEAGE_DEPTH_DEFAULT),
      downstreamDepth: clampLineageDepth(options.downstreamDepth ?? LINEAGE_DEPTH_DEFAULT),
    },
  });
}
