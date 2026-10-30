/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString, parsePaged } from '@/api/json';
import type {
  CreateDataQualityDimensionRequest,
  DataQualityDimension,
  Paged,
} from '@/types/admin';
import { apiRequest } from './client';

function mapDimension(raw: Record<string, unknown>): DataQualityDimension | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;
  const style = asRecord(raw.style) ?? {};
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    deleted: Boolean(raw.deleted),
    style: { color: asString(style.color) || undefined },
    provider: asString(raw.provider) || undefined,
  };
}

export function listDataQualityDimensions(params?: {
  limit?: number;
  after?: string;
}): Promise<Paged<DataQualityDimension>> {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.after) q.set('after', params.after);
  const qs = q.toString();
  return apiRequest<unknown>(`/v1/dataQuality/dimensions${qs ? `?${qs}` : ''}`).then((payload) =>
    parsePaged(payload, mapDimension),
  );
}

export function createDataQualityDimension(
  body: CreateDataQualityDimensionRequest,
): Promise<DataQualityDimension> {
  return apiRequest<Record<string, unknown>>('/v1/dataQuality/dimensions', {
    method: 'POST',
    json: body,
  }).then((raw) => {
    const mapped = mapDimension(raw);
    if (!mapped) throw new Error('createDataQualityDimension missing id/name');
    return mapped;
  });
}

export function deleteDataQualityDimension(id: string): Promise<void> {
  return apiRequest<unknown>(`/v1/dataQuality/dimensions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).then(() => undefined);
}
