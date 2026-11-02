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
import { mapTags } from './entities';

export const DATA_PRODUCT_FIELDS = 'domains,owners,reviewers,experts,tags';

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
