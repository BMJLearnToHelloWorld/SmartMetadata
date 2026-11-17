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
import { mapServiceAttributes, mapServiceTags, mapTestConnectionResult } from '@/api/serviceCommon';
import type { AsyncDeleteJob, ServiceDeleteOptions } from '@/ingestion/serviceDelete';
import type { IncludeFilter, Paged } from '@/types/admin';
import type { CatalogService, CreateDashboardServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const DASHBOARD_SERVICE_FIELDS = 'owners,pipelines,tags,followers,domains,dataProducts';

export interface ListDashboardServicesQuery {
  limit?: number;
  after?: string;
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

export function mapDashboardService(raw: Record<string, unknown>): CatalogService | null {
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
    kind: 'dashboard',
    serviceType: asString(raw.serviceType),
    owners: mapEntityRefs(raw.owners),
    tags: mapServiceTags(raw.tags),
    followers: mapEntityRefs(raw.followers),
    domains: mapEntityRefs(raw.domains),
    dataProducts: mapEntityRefs(raw.dataProducts),
    version: asNumber(raw.version),
    serviceAttributes: mapServiceAttributes(raw.serviceAttributes),
    connection: mapConnection(raw.connection),
    testConnectionResult: mapTestConnectionResult(raw.testConnectionResult),
    deleted: asBoolean(raw.deleted),
  };
}

export function listDashboardServices(query: ListDashboardServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/dashboardServices', {
    query: {
      fields: DASHBOARD_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
      include: query.include,
    },
  }).then((payload) => parsePaged(payload, mapDashboardService));
}

export async function getDashboardService(id: string, include?: IncludeFilter): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/dashboardServices/${encodeURIComponent(id)}`,
    { query: { fields: DASHBOARD_SERVICE_FIELDS, include } },
  );
  const mapped = mapDashboardService(raw);
  if (!mapped) {
    throw new Error('Dashboard service response was missing id and name');
  }
  return mapped;
}

export async function createDashboardService(body: CreateDashboardServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/dashboardServices', {
    method: 'POST',
    json: body,
  });
  const mapped = mapDashboardService(raw);
  if (!mapped) {
    throw new Error('Create dashboard service succeeded but the response had no service');
  }
  return mapped;
}

export async function updateDashboardService(body: CreateDashboardServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/dashboardServices', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapDashboardService(raw);
  if (!mapped) {
    throw new Error('Update dashboard service succeeded but the response had no service');
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
export function deleteDashboardService(id: string, options: ServiceDeleteOptions = {}): Promise<AsyncDeleteJob> {
  return apiRequest<AsyncDeleteJob>(`/v1/services/dashboardServices/async/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: options.hardDelete ?? false, recursive: options.recursive ?? true },
  });
}

/**
 * Official restoreService (rest/serviceAPI.ts): PUT /services/dashboardServices/restore
 * with JSON body { id }; returns the restored service. Restoring
 * revives the service's children too, so callers refetch after a restore.
 */
export async function restoreDashboardService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/dashboardServices/restore', {
    method: 'PUT',
    json: { id },
  });
  const mapped = mapDashboardService(raw);
  if (!mapped) {
    throw new Error('Restore dashboard service succeeded but the response had no service');
  }
  return mapped;
}
