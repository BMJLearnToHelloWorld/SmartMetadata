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
import { mapTestConnectionResult } from '@/api/serviceCommon';
import type { Paged } from '@/types/admin';
import type { CatalogService, CreateDatabaseServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const MLMODEL_SERVICE_FIELDS = 'owners,pipelines';

export interface ListMlModelServicesQuery {
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

export function mapMlModelService(raw: Record<string, unknown>): CatalogService | null {
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
    kind: 'mlmodel',
    serviceType: asString(raw.serviceType),
    connection: mapConnection(raw.connection),
    testConnectionResult: mapTestConnectionResult(raw.testConnectionResult),
  };
}

export function listMlModelServices(query: ListMlModelServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/mlmodelServices', {
    query: {
      fields: MLMODEL_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapMlModelService));
}

export async function getMlModelService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/mlmodelServices/${encodeURIComponent(id)}`,
    { query: { fields: MLMODEL_SERVICE_FIELDS } },
  );
  const mapped = mapMlModelService(raw);
  if (!mapped) {
    throw new Error('MlModel service response was missing id and name');
  }
  return mapped;
}

export async function createMlModelService(body: CreateDatabaseServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/mlmodelServices', {
    method: 'POST',
    json: body,
  });
  const mapped = mapMlModelService(raw);
  if (!mapped) {
    throw new Error('Create mlmodel service succeeded but the response had no service');
  }
  return mapped;
}

export async function updateMlModelService(body: CreateDatabaseServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/mlmodelServices', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapMlModelService(raw);
  if (!mapped) {
    throw new Error('Update mlmodel service succeeded but the response had no service');
  }
  return mapped;
}

export function deleteMlModelService(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/mlmodelServices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
