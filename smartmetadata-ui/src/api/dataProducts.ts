/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import type { CreateDataProductRequest, DataProduct } from '@/types/governance';
import { apiRequest } from './client';
import { addBulkAssets, removeBulkAssets, type BulkAssetResult } from './bulkAssets';
import { mapTags } from './entities';

export const DATA_PRODUCT_FIELDS = 'domains,owners,reviewers,experts,tags,extension';

export type { BulkAssetResult };

/**
 * Official addAssetsToDataProduct (rest/dataProductAPI.ts): PUT
 * /v1/dataProducts/{name}/assets/add with {assets}; server authorizes
 * EDIT_ALL on the data product and answers a BulkOperationResult.
 * {name} is the fully qualified name.
 */
export function addDataProductAssets(fqn: string, assets: EntityRef[]): Promise<BulkAssetResult> {
  return addBulkAssets('dataProducts', fqn, assets);
}

/** Official removeAssetsFromDataProduct: PUT /v1/dataProducts/{name}/assets/remove. */
export function removeDataProductAssets(
  fqn: string,
  assets: EntityRef[],
): Promise<BulkAssetResult> {
  return removeBulkAssets('dataProducts', fqn, assets);
}

/**
 * Generic entity JSON Patch for custom-property (extension) edits on a
 * data product — the same application/json-patch+json contract the asset
 * detail view uses via patchAsset, scoped here so the shared patch
 * registry (which does not cover governance collections) stays untouched.
 */
export function patchDataProduct(id: string, patch: unknown[]): Promise<unknown> {
  return apiRequest(`/v1/dataProducts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}

export interface ListDataProductsQuery {
  limit?: number;
  after?: string;
}

function mapDataProduct(raw: Record<string, unknown>): DataProduct | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    domains: mapEntityRefs(raw.domains),
    owners: mapEntityRefs(raw.owners),
    experts: mapEntityRefs(raw.experts),
    tags: mapTags(raw.tags),
    extension:
      raw.extension && typeof raw.extension === 'object'
        ? (raw.extension as Record<string, unknown>)
        : undefined,
  };
}

export function listDataProducts(query: ListDataProductsQuery = {}): Promise<Paged<DataProduct>> {
  return apiRequest<unknown>('/v1/dataProducts', {
    query: {
      fields: DATA_PRODUCT_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapDataProduct));
}

export async function getDataProduct(id: string): Promise<DataProduct> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/dataProducts/${encodeURIComponent(id)}`,
    { query: { fields: DATA_PRODUCT_FIELDS } },
  );
  const mapped = mapDataProduct(raw);
  if (!mapped) {
    throw new Error('Data product response was missing id and name');
  }
  return mapped;
}

/**
 * Official getDataProductByName (rest/dataProductAPI.ts): GET
 * /v1/dataProducts/name/{name}. The marketplace announcement widget only
 * carries the fqn, so this is the fqn→id resolution for its click-through.
 */
export async function getDataProductByName(name: string): Promise<DataProduct> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/dataProducts/name/${encodeURIComponent(name)}`,
    { query: { fields: DATA_PRODUCT_FIELDS } },
  );
  const mapped = mapDataProduct(raw);
  if (!mapped) {
    throw new Error('Data product response was missing id and name');
  }
  return mapped;
}

export async function createDataProduct(body: CreateDataProductRequest): Promise<DataProduct> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/dataProducts', {
    method: 'POST',
    json: body,
  });
  const mapped = mapDataProduct(raw);
  if (!mapped) {
    throw new Error('Create data product succeeded but the response had no data product');
  }
  return mapped;
}

export async function updateDataProduct(body: CreateDataProductRequest): Promise<DataProduct> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/dataProducts', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapDataProduct(raw);
  if (!mapped) {
    throw new Error('Update data product succeeded but the response had no data product');
  }
  return mapped;
}

export function listDataProductAssets(id: string, limit = 25): Promise<Paged<EntityRef>> {
  return apiRequest<unknown>(`/v1/dataProducts/${encodeURIComponent(id)}/assets`, {
    query: { limit },
  }).then((payload) => parsePaged(payload, (raw) => mapEntityRefs([raw])[0] ?? null));
}

/** Official deleteDataProduct (rest/dataProductAPI.ts): plain DELETE, no params. */
export function deleteDataProduct(id: string): Promise<unknown> {
  return apiRequest(`/v1/dataProducts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Official dataProductAPI.getAllDataProductsWithAssetsCount
 * (rest/dataProductAPI.ts): GET /v1/dataProducts/assets/counts, a
 * whole-table Map<fqn, count>.
 */
export async function getAllDataProductsWithAssetsCount(): Promise<Record<string, number>> {
  const payload = await apiRequest<unknown>('/v1/dataProducts/assets/counts');
  const root = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
  const out: Record<string, number> = {};
  if (root) {
    for (const [key, value] of Object.entries(root)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value;
      }
    }
  }
  return out;
}
