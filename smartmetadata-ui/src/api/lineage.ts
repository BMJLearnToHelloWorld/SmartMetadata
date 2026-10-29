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

export interface LineageEdgeEndpoints {
  fromType: string;
  fromFqn: string;
  toType: string;
  toFqn: string;
}

export interface PutEntityLineageOptions extends LineageEdgeEndpoints {
  /** Apache LineageDetails body; defaults to Manual source (MCP create_lineage). */
  details?: Record<string, unknown>;
}

function requireEdgeEndpoints(options: LineageEdgeEndpoints): LineageEdgeEndpoints {
  const fromType = options.fromType.trim();
  const fromFqn = options.fromFqn.trim();
  const toType = options.toType.trim();
  const toFqn = options.toFqn.trim();
  if (!fromType || !toType) {
    throw new Error('Lineage write requires from and to entity types');
  }
  if (!fromFqn || !toFqn) {
    throw new Error('Lineage write requires from and to FQNs');
  }
  return { fromType, fromFqn, toType, toFqn };
}

/** PUT /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn} — same path as RestClient.put_lineage / MCP create_lineage. */
export function lineageEdgePath(options: LineageEdgeEndpoints): string {
  const edge = requireEdgeEndpoints(options);
  return (
    `/v1/lineage/${encodeURIComponent(edge.fromType)}/name/${encodeFqnForApi(edge.fromFqn)}` +
    `/${encodeURIComponent(edge.toType)}/name/${encodeFqnForApi(edge.toFqn)}`
  );
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

/**
 * PUT lineage edge by name. Body defaults to `{ source: 'Manual' }` (MCP create_lineage).
 */
export async function putEntityLineage(options: PutEntityLineageOptions): Promise<unknown> {
  const path = lineageEdgePath(options);
  const details = options.details ?? { source: 'Manual' };
  return apiRequest<unknown>(path, {
    method: 'PUT',
    json: details,
  });
}

/**
 * DELETE /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn} — RestClient.delete_lineage_by_name.
 * Client helper only; canvas has no delete control yet (do not invent one).
 */
export async function deleteEntityLineageByName(options: LineageEdgeEndpoints): Promise<unknown> {
  return apiRequest<unknown>(lineageEdgePath(options), { method: 'DELETE' });
}
