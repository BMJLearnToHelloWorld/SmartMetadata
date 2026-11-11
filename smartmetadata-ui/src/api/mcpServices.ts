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

export const MCP_SERVICE_FIELDS = 'owners,pipelines';

export interface ListMcpServicesQuery {
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
  };
}

export function listMcpServices(query: ListMcpServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/mcpServices', {
    query: {
      fields: MCP_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapMcpService));
}

export async function getMcpService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/mcpServices/${encodeURIComponent(id)}`,
    { query: { fields: MCP_SERVICE_FIELDS } },
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

export function deleteMcpService(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/mcpServices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
