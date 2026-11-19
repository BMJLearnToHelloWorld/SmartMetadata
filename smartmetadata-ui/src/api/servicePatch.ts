/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { SERVICE_MAP_API } from '@/ingestion/serviceApis';
import type { CatalogService, ServiceKind } from '@/types/ingestion';
import { apiRequest } from './client';
import { SERVICE_COLLECTION_BY_KIND } from './serviceVersions';

/**
 * Official patchService (rest/serviceAPI.ts): PATCH
 * /v1/services/{collection}/{id} with a JSON Patch body, returning the
 * updated service. This is the single write outlet for every
 * service-detail field edit (facets, description, display name,
 * service attributes): callers echo the mapped response directly,
 * never re-fetch, and never fall back to a full-body PUT update, which
 * drops connection keys.
 *
 * The generic patchAsset cannot serve services: resolvePatchPath
 * reads DETAIL_ENDPOINTS, whose `/v1/{collection}` shape has no
 * service entries, and adding them would skew the followers and
 * versions resolvers that share the table.
 *
 * Callers always send single-field ops (setFieldPatch), so an empty
 * op list is unreachable on the normal path; it is refused here as a
 * defensive guard, before any request is sent.
 */
export async function patchService(
  kind: ServiceKind,
  id: string,
  ops: JsonPatchOp[],
): Promise<CatalogService> {
  if (ops.length === 0) {
    throw new Error('patchService requires at least one JSON Patch operation');
  }
  const collection = SERVICE_COLLECTION_BY_KIND[kind];
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/${collection}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      json: ops,
      contentType: 'application/json-patch+json',
    },
  );
  const mapped = SERVICE_MAP_API[kind](raw);
  if (!mapped) {
    throw new Error('Service patch response was missing id and name');
  }
  return mapped;
}
