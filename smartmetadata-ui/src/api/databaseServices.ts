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
import type { CatalogService, CreateDatabaseServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const DATABASE_SERVICE_FIELDS = 'owners,pipelines';

export interface ListDatabaseServicesQuery {
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

export function mapDatabaseService(raw: Record<string, unknown>): CatalogService | null {
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
    kind: 'database',
    serviceType: asString(raw.serviceType),
    connection: mapConnection(raw.connection),
  };
}

export function listDatabaseServices(query: ListDatabaseServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/databaseServices', {
    query: {
      fields: DATABASE_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapDatabaseService));
}

export async function getDatabaseService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/databaseServices/${encodeURIComponent(id)}`,
    { query: { fields: DATABASE_SERVICE_FIELDS } },
  );
  const mapped = mapDatabaseService(raw);
  if (!mapped) {
    throw new Error('Database service response was missing id and name');
  }
  return mapped;
}

export async function createDatabaseService(body: CreateDatabaseServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/databaseServices', {
    method: 'POST',
    json: body,
  });
  const mapped = mapDatabaseService(raw);
  if (!mapped) {
    throw new Error('Create database service succeeded but the response had no service');
  }
  return mapped;
}

export async function updateDatabaseService(body: CreateDatabaseServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/databaseServices', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapDatabaseService(raw);
  if (!mapped) {
    throw new Error('Update database service succeeded but the response had no service');
  }
  return mapped;
}

export function deleteDatabaseService(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/databaseServices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
