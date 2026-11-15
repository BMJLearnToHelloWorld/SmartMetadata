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
import { mapTestConnectionResult } from '@/api/serviceCommon';
import type { AsyncDeleteJob, ServiceDeleteOptions } from '@/ingestion/serviceDelete';
import type { IncludeFilter, Paged } from '@/types/admin';
import type { CatalogService, CreateDatabaseServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const MCP_SERVICE_FIELDS = 'owners,pipelines';

export interface ListMcpServicesQuery {
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

export function mapMcpService(raw: Record<string, unknown>): CatalogService | null {
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
    kind: 'mcp',
    serviceType: asString(raw.serviceType),
    owners: mapEntityRefs(raw.owners),
    connection: mapConnection(raw.connection),
    testConnectionResult: mapTestConnectionResult(raw.testConnectionResult),
    deleted: asBoolean(raw.deleted),
  };
}

export function listMcpServices(query: ListMcpServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/mcpServices', {
    query: {
      fields: MCP_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
      include: query.include,
    },
  }).then((payload) => parsePaged(payload, mapMcpService));
}

export async function getMcpService(id: string, include?: IncludeFilter): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/mcpServices/${encodeURIComponent(id)}`,
    { query: { fields: MCP_SERVICE_FIELDS, include } },
  );
  const mapped = mapMcpService(raw);
  if (!mapped) {
    throw new Error('Mcp service response was missing id and name');
  }
  return mapped;
}

export async function createMcpService(body: CreateDatabaseServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/mcpServices', {
    method: 'POST',
    json: body,
  });
  const mapped = mapMcpService(raw);
  if (!mapped) {
    throw new Error('Create mcp service succeeded but the response had no service');
  }
  return mapped;
}

export async function updateMcpService(body: CreateDatabaseServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/mcpServices', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapMcpService(raw);
  if (!mapped) {
    throw new Error('Update mcp service succeeded but the response had no service');
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
export function deleteMcpService(id: string, options: ServiceDeleteOptions = {}): Promise<AsyncDeleteJob> {
  return apiRequest<AsyncDeleteJob>(`/v1/services/mcpServices/async/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: options.hardDelete ?? false, recursive: options.recursive ?? true },
  });
}

/**
 * Official restoreService (rest/serviceAPI.ts): PUT /services/mcpServices/restore
 * with JSON body { id }; returns the restored service. Restoring
 * revives the service's children too, so callers refetch after a restore.
 */
export async function restoreMcpService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/mcpServices/restore', {
    method: 'PUT',
    json: { id },
  });
  const mapped = mapMcpService(raw);
  if (!mapped) {
    throw new Error('Restore mcp service succeeded but the response had no service');
  }
  return mapped;
}
