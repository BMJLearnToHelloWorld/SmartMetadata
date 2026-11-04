/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asString, mapEntityRefs } from '@/api/json';
import type { EntityRef } from '@/types/api';
import { apiRequest } from './client';

/**
 * Bulk asset write result (openmetadata-spec type/bulkOperationResult.json):
 * per-row outcomes plus counts. A row can be accepted yet held for approval
 * (numberOfRowsPendingApproval); a failed row still answers 200 with the
 * row in failedRequest, while a wholly invalid request answers 400.
 */
export interface BulkAssetResponse {
  request: EntityRef | null;
  message?: string;
  status?: number;
}

export interface BulkAssetResult {
  status?: string;
  processed?: number;
  passed?: number;
  failed?: number;
  pendingApproval?: number;
  abortReason?: string;
  success: BulkAssetResponse[];
  failedRequests: BulkAssetResponse[];
}

function mapBulkAssetResponse(raw: unknown): BulkAssetResponse {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const refs = mapEntityRefs(rec.request ? [rec.request] : []);
  return {
    request: refs[0] ?? null,
    message: asString(rec.message) || undefined,
    status: asNumber(rec.status),
  };
}

function mapBulkAssetResult(raw: unknown): BulkAssetResult {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const success = Array.isArray(rec.successRequest) ? rec.successRequest.map(mapBulkAssetResponse) : [];
  const failedRequests = Array.isArray(rec.failedRequest)
    ? rec.failedRequest.map(mapBulkAssetResponse)
    : [];
  return {
    status: asString(rec.status) || undefined,
    processed: asNumber(rec.numberOfRowsProcessed),
    passed: asNumber(rec.numberOfRowsPassed),
    failed: asNumber(rec.numberOfRowsFailed),
    pendingApproval: asNumber(rec.numberOfRowsPendingApproval),
    abortReason: asString(rec.abortReason) || undefined,
    success,
    failedRequests,
  };
}

function toBulkAssetRefs(assets: EntityRef[]): Record<string, unknown>[] {
  return assets.map((asset) => ({
    id: asset.id,
    type: asset.type,
    name: asset.name,
    fullyQualifiedName: asset.fullyQualifiedName,
  }));
}

/**
 * Bulk asset writes (official rest/dataProductAPI.ts + DomainResource):
 * PUT /v1/{collection}/{name}/assets/add|remove with {assets}; the server
 * authorizes EDIT_ALL on the owning entity and answers a BulkOperationResult.
 * {name} is the fully qualified name.
 */
export async function addBulkAssets(
  collection: 'dataProducts' | 'domains',
  fqn: string,
  assets: EntityRef[],
): Promise<BulkAssetResult> {
  const raw = await apiRequest<unknown>(
    `/v1/${collection}/${encodeURIComponent(fqn)}/assets/add`,
    { method: 'PUT', json: { assets: toBulkAssetRefs(assets) } },
  );
  return mapBulkAssetResult(raw);
}

export async function removeBulkAssets(
  collection: 'dataProducts' | 'domains',
  fqn: string,
  assets: EntityRef[],
): Promise<BulkAssetResult> {
  const raw = await apiRequest<unknown>(
    `/v1/${collection}/${encodeURIComponent(fqn)}/assets/remove`,
    { method: 'PUT', json: { assets: toBulkAssetRefs(assets) } },
  );
  return mapBulkAssetResult(raw);
}
