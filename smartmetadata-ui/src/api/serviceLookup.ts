/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { SERVICE_MAP_API } from '@/ingestion/serviceApis';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import type { CatalogService, ServiceKind } from '@/types/ingestion';
import { getEncodedFqn } from '@/utils/fqnPaths';
import { apiRequest } from './client';
import { SERVICE_COLLECTION_BY_KIND } from './serviceVersions';

/**
 * `getServiceByFQN` (official `rest/serviceAPI.ts`), generalized over
 * the product's kind dispatch: GET
 * `/v1/services/{collection}/name/{encodedFqn}` with `include`
 * defaulting to non-deleted and `includeRelations` defaulting to
 * `owners:non-deleted,experts:non-deleted`. Any HTTP failure
 * rejects — the name-validation duplicate check reads success as
 * "taken" and any failure as "available", exactly like the pin.
 */
export async function getServiceByFqn(
  kind: ServiceKind,
  fqn: string,
  params?: { fields?: string; include?: string; includeRelations?: string },
): Promise<CatalogService> {
  const collection = SERVICE_COLLECTION_BY_KIND[kind];
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/${collection}/name/${getEncodedFqn(fqn)}`,
    {
      query: {
        fields: params?.fields,
        include: params?.include ?? 'non-deleted',
        includeRelations: params?.includeRelations ?? 'owners:non-deleted,experts:non-deleted',
      },
    },
  );
  const mapped = SERVICE_MAP_API[kind](raw);
  if (!mapped) {
    throw new Error('Service response was missing id and name');
  }
  return mapped;
}

/**
 * `patchService` (official `rest/serviceAPI.ts:185-196`), generalized over
 * the product's kind dispatch: PATCH `/v1/services/{collection}/{id}` with a
 * JSON Patch body and `application/json-patch+json`. The pin's typed
 * signature claims a `ServicesUpdateRequest` body but the call site passes
 * the `compare()` op array — the wire shape is the patch array, and this
 * function types it honestly. `patchAsset` does not cover services (its
 * endpoint table has no service entries), so the edit page patches here.
 *
 * Relationship to the other `patchService` in `api/servicePatch.ts`: same
 * endpoint and content type, different contract, deliberately not merged.
 * This one serves the connection-edit page (`EditServiceConnectionView`),
 * whose caller guarantees a non-empty patch (an empty patch leaves without
 * a request) and passes UUID ids unencoded; a missing service rejects with
 * 'Service response was missing id and name'. The `servicePatch.ts`
 * variant serves single-field detail edits (`ServiceDetailView`,
 * `ServiceHeaderFacets`), refuses an empty op list before any request,
 * encodes the id, and reports a missing service as 'Service patch response
 * was missing id and name'. Keep the two in sync on endpoint and
 * content type; do not merge them without reconciling those four
 * differences and the tests that lock them in.
 */
export async function patchService(
  kind: ServiceKind,
  id: string,
  patch: JsonPatchOp[],
): Promise<CatalogService> {
  const collection = SERVICE_COLLECTION_BY_KIND[kind];
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/${collection}/${id}`,
    {
      method: 'PATCH',
      json: patch,
      contentType: 'application/json-patch+json',
    },
  );
  const mapped = SERVICE_MAP_API[kind](raw);
  if (!mapped) {
    throw new Error('Service response was missing id and name');
  }
  return mapped;
}
