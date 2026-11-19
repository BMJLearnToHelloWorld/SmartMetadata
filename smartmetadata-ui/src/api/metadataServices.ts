/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import { mapServiceAttributes, mapServiceStyle, mapServiceTags, mapTestConnectionResult } from '@/api/serviceCommon';
import type { AsyncDeleteJob, ServiceDeleteOptions } from '@/ingestion/serviceDelete';
import type { IncludeFilter, Paged } from '@/types/admin';
import type { CatalogService, CreateDatabaseServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const METADATA_SERVICE_FIELDS = 'owners,pipelines,tags,followers,domains';

export interface ListMetadataServicesQuery {
  limit?: number;
  after?: string;
  before?: string;
  /** Field-set override; defaults to the per-kind constant below. */
  fields?: string;
  include?: IncludeFilter;
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
    tags: mapServiceTags(raw.tags),
    followers: mapEntityRefs(raw.followers),
    domains: mapEntityRefs(raw.domains),
    dataProducts: mapEntityRefs(raw.dataProducts),
    version: asNumber(raw.version),
    serviceAttributes: mapServiceAttributes(raw.serviceAttributes),
    style: mapServiceStyle(raw.style),
    connection: mapConnection(raw.connection),
    testConnectionResult: mapTestConnectionResult(raw.testConnectionResult),
    deleted: asBoolean(raw.deleted),
  };
}

export function listMetadataServices(query: ListMetadataServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/metadataServices', {
    query: {
      fields: query.fields ?? METADATA_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
      before: query.before,
      include: query.include,
    },
  }).then((payload) => parsePaged(payload, mapMetadataService));
}

export async function getMetadataService(id: string, include?: IncludeFilter): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/metadataServices/${encodeURIComponent(id)}`,
    { query: { fields: METADATA_SERVICE_FIELDS, include } },
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

/**
 * Official deleteAsyncEntity (rest/miscAPI.ts): services delete
 * through the async endpoint with hardDelete + recursive; the pin
 * passes recursive=true from both service detail surfaces. Returns
 * the async job record (its message is toasted on submit); completion
 * is observed through the bounded re-read in serviceDelete.ts (D-F5).
 */
export function deleteMetadataService(id: string, options: ServiceDeleteOptions = {}): Promise<AsyncDeleteJob> {
  return apiRequest<AsyncDeleteJob>(`/v1/services/metadataServices/async/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: options.hardDelete ?? false, recursive: options.recursive ?? true },
  });
}

/**
 * Official restoreService (rest/serviceAPI.ts): PUT /services/metadataServices/restore
 * with JSON body { id }; returns the restored service. Restoring
 * revives the service's children too, so callers refetch after a restore.
 */
export async function restoreMetadataService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/metadataServices/restore', {
    method: 'PUT',
    json: { id },
  });
  const mapped = mapMetadataService(raw);
  if (!mapped) {
    throw new Error('Restore metadata service succeeded but the response had no service');
  }
  return mapped;
}
