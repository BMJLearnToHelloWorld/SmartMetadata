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
import type { Paged } from '@/types/admin';
import type { CatalogService, CreateStorageServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const STORAGE_SERVICE_FIELDS = 'owners';

export interface ListStorageServicesQuery {
  limit?: number;
  after?: string;
}

function mapConnection(value: unknown): ServiceConnection | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const config = asRecord(rec.config);
  return { config: config ?? undefined };
}

export function mapStorageService(raw: Record<string, unknown>): CatalogService | null {
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
    kind: 'storage',
    serviceType: asString(raw.serviceType),
    connection: mapConnection(raw.connection),
  };
}

export function listStorageServices(query: ListStorageServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/storageServices', {
    query: {
      fields: STORAGE_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapStorageService));
}

export async function getStorageService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/storageServices/${encodeURIComponent(id)}`,
    { query: { fields: STORAGE_SERVICE_FIELDS } },
  );
  const mapped = mapStorageService(raw);
  if (!mapped) {
    throw new Error('Storage service response was missing id and name');
  }
  return mapped;
}

export async function createStorageService(body: CreateStorageServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/storageServices', {
    method: 'POST',
    json: body,
  });
  const mapped = mapStorageService(raw);
  if (!mapped) {
    throw new Error('Create storage service succeeded but the response had no service');
  }
  return mapped;
}

export async function updateStorageService(body: CreateStorageServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/storageServices', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapStorageService(raw);
  if (!mapped) {
    throw new Error('Update storage service succeeded but the response had no service');
  }
  return mapped;
}

export function deleteStorageService(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/storageServices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
