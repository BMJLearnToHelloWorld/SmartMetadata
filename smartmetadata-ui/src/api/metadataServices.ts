/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import { mapTestConnectionResult } from '@/api/serviceCommon';
import type { Paged } from '@/types/admin';
import type { CatalogService, CreateDatabaseServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const METADATA_SERVICE_FIELDS = 'owners,pipelines';

export interface ListMetadataServicesQuery {
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

export function mapMetadataService(raw: Record<string, unknown>): CatalogService | null {
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
    kind: 'metadata',
    serviceType: asString(raw.serviceType),
    owners: mapEntityRefs(raw.owners),
    connection: mapConnection(raw.connection),
    testConnectionResult: mapTestConnectionResult(raw.testConnectionResult),
  };
}

export function listMetadataServices(query: ListMetadataServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/metadataServices', {
    query: {
      fields: METADATA_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapMetadataService));
}

export async function getMetadataService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/metadataServices/${encodeURIComponent(id)}`,
    { query: { fields: METADATA_SERVICE_FIELDS } },
  );
  const mapped = mapMetadataService(raw);
  if (!mapped) {
    throw new Error('Metadata service response was missing id and name');
  }
  return mapped;
}

export async function createMetadataService(body: CreateDatabaseServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/metadataServices', {
    method: 'POST',
    json: body,
  });
  const mapped = mapMetadataService(raw);
  if (!mapped) {
    throw new Error('Create metadata service succeeded but the response had no service');
  }
  return mapped;
}

export async function updateMetadataService(body: CreateDatabaseServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/metadataServices', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapMetadataService(raw);
  if (!mapped) {
    throw new Error('Update metadata service succeeded but the response had no service');
  }
  return mapped;
}

export function deleteMetadataService(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/metadataServices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
