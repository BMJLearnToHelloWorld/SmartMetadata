/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import type { SearchHit } from '@/types/api';
import type { CreateDataProductRequest, DataProduct } from '@/types/governance';
import { apiRequest } from './client';
import { addBulkAssets, removeBulkAssets, type BulkAssetResult } from './bulkAssets';
import { mapCertification, mapTags } from './entities';
import { searchAssets } from './search';

export const DATA_PRODUCT_FIELDS = 'domains,owners,reviewers,experts,tags,extension,certification';

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

// ---------------------------------------------------------------------------
// Input/output ports (Q-TAB-4 item 3, host lane)
// ---------------------------------------------------------------------------

/** Pin rest/dataProductAPI.ts PORT_FIELDS, the field set for port list fetches. */
export const DATA_PRODUCT_PORT_FIELDS = 'owners,tags,domains,extension';

/**
 * Pin `DataProductPortsView` (generated api/domains/dataProductPortsView.ts,
 * a3012259ca): the combined input/output view for the ports lineage graph,
 * with independent pagination per port type. The product panel lists the
 * same two paginated sets; the PortsLineageView accordion (a later lane)
 * mounts above the lists and consumes this same client.
 */
export interface DataProductPortsView {
  inputPorts: Paged<EntityRef>;
  outputPorts: Paged<EntityRef>;
}

export interface DataProductPortsQuery {
  limit?: number;
  offset?: number;
}

/** Pin getDataProductInputPorts: GET /v1/dataProducts/name/{fqn}/inputPorts. */
export function getDataProductInputPorts(
  fqn: string,
  query: DataProductPortsQuery = {},
): Promise<Paged<EntityRef>> {
  return apiRequest<unknown>(`/v1/dataProducts/name/${encodeURIComponent(fqn)}/inputPorts`, {
    query: { limit: query.limit ?? 25, offset: query.offset, fields: DATA_PRODUCT_PORT_FIELDS },
  }).then((payload) => parsePaged(payload, (raw) => mapEntityRefs([raw])[0] ?? null));
}

/** Pin getDataProductOutputPorts: GET /v1/dataProducts/name/{fqn}/outputPorts. */
export function getDataProductOutputPorts(
  fqn: string,
  query: DataProductPortsQuery = {},
): Promise<Paged<EntityRef>> {
  return apiRequest<unknown>(`/v1/dataProducts/name/${encodeURIComponent(fqn)}/outputPorts`, {
    query: { limit: query.limit ?? 25, offset: query.offset, fields: DATA_PRODUCT_PORT_FIELDS },
  }).then((payload) => parsePaged(payload, (raw) => mapEntityRefs([raw])[0] ?? null));
}

export interface DataProductPortsViewQuery {
  inputLimit?: number;
  inputOffset?: number;
  outputLimit?: number;
  outputOffset?: number;
}

/** Pin getDataProductPortsView: GET /v1/dataProducts/name/{fqn}/portsView. */
export async function getDataProductPortsView(
  fqn: string,
  query: DataProductPortsViewQuery = {},
): Promise<DataProductPortsView> {
  const payload = await apiRequest<unknown>(
    `/v1/dataProducts/name/${encodeURIComponent(fqn)}/portsView`,
    {
      query: {
        ...(query.inputLimit !== undefined ? { inputLimit: query.inputLimit } : {}),
        ...(query.inputOffset !== undefined ? { inputOffset: query.inputOffset } : {}),
        ...(query.outputLimit !== undefined ? { outputLimit: query.outputLimit } : {}),
        ...(query.outputOffset !== undefined ? { outputOffset: query.outputOffset } : {}),
      },
    },
  );
  const root = asRecord(payload) ?? {};
  return {
    inputPorts: parsePaged(root.inputPorts, (raw) => mapEntityRefs([raw])[0] ?? null),
    outputPorts: parsePaged(root.outputPorts, (raw) => mapEntityRefs([raw])[0] ?? null),
  };
}

async function updateDataProductPorts(
  fqn: string,
  kind: 'inputPorts' | 'outputPorts',
  action: 'add' | 'remove',
  ports: EntityRef[],
): Promise<DataProduct> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/dataProducts/${encodeURIComponent(fqn)}/${kind}/${action}`,
    {
      method: 'PUT',
      json: {
        assets: ports.map((port) => ({
          id: port.id,
          type: port.type,
          name: port.name,
          fullyQualifiedName: port.fullyQualifiedName,
        })),
      },
    },
  );
  const mapped = mapDataProduct(raw);
  if (!mapped) {
    throw new Error('Update data product ports succeeded but the response had no data product');
  }
  return mapped;
}

/**
 * Pin addInputPortsToDataProduct: PUT /v1/dataProducts/{fqn}/inputPorts/add
 * with {assets}; the server answers the updated data product.
 */
export function addInputPortsToDataProduct(fqn: string, ports: EntityRef[]): Promise<DataProduct> {
  return updateDataProductPorts(fqn, 'inputPorts', 'add', ports);
}

/** Pin removeInputPortsFromDataProduct: PUT /v1/dataProducts/{fqn}/inputPorts/remove. */
export function removeInputPortsFromDataProduct(
  fqn: string,
  ports: EntityRef[],
): Promise<DataProduct> {
  return updateDataProductPorts(fqn, 'inputPorts', 'remove', ports);
}

/** Pin addOutputPortsToDataProduct: PUT /v1/dataProducts/{fqn}/outputPorts/add. */
export function addOutputPortsToDataProduct(fqn: string, ports: EntityRef[]): Promise<DataProduct> {
  return updateDataProductPorts(fqn, 'outputPorts', 'add', ports);
}

/** Pin removeOutputPortsFromDataProduct: PUT /v1/dataProducts/{fqn}/outputPorts/remove. */
export function removeOutputPortsFromDataProduct(
  fqn: string,
  ports: EntityRef[],
): Promise<DataProduct> {
  return updateDataProductPorts(fqn, 'outputPorts', 'remove', ports);
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
    deleted: asBoolean(raw.deleted),
    domains: mapEntityRefs(raw.domains),
    owners: mapEntityRefs(raw.owners),
    reviewers: mapEntityRefs(raw.reviewers),
    experts: mapEntityRefs(raw.experts),
    tags: mapTags(raw.tags),
    // D-2 batch 2: pin reads the certification field, not the
    // `Certification.*` tag in `tags`.
    certification: mapCertification(asRecord(raw.certification)),
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

/**
 * Pin DataProductListPage search (useDataProductListingData with
 * SearchIndex.DATA_PRODUCT = 'dataProduct'): the listing is ES-search
 * backed while a query is present. The shared searchAssets helper sends
 * the same GET /v1/search/query call; hits map back to DataProduct rows
 * (the list only renders id/name/displayName/description/domains, all
 * carried by the hit). Offset paging (`from`) because the search
 * endpoint has no cursor.
 */
export async function searchDataProducts(
  query: string,
  from = 0,
  size = 25,
): Promise<Paged<DataProduct>> {
  const page = await searchAssets(query, from, size, { index: 'dataProduct' });
  return {
    data: page.hits.flatMap((hit: SearchHit) => {
      const product = hitToDataProduct(hit);
      return product ? [product] : [];
    }),
    total: page.total,
  };
}

function hitToDataProduct(hit: SearchHit): DataProduct | null {
  if (!hit.id && !hit.name) {
    return null;
  }
  return {
    id: hit.id ?? hit.fullyQualifiedName,
    name: hit.name,
    displayName: hit.displayName,
    description: hit.description,
    fullyQualifiedName: hit.fullyQualifiedName || hit.name,
    domains: hit.domains ?? [],
    owners: hit.owners ?? [],
    reviewers: [],
    experts: [],
    tags: hit.tags ?? [],
  };
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
