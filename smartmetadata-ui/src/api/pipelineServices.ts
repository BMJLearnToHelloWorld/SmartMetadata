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
import type { CatalogService, CreatePipelineServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const PIPELINE_SERVICE_FIELDS = 'owners';

export interface ListPipelineServicesQuery {
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

export function mapPipelineService(raw: Record<string, unknown>): CatalogService | null {
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
    kind: 'pipeline',
    serviceType: asString(raw.serviceType),
    connection: mapConnection(raw.connection),
  };
}

export function listPipelineServices(query: ListPipelineServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/pipelineServices', {
    query: {
      fields: PIPELINE_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapPipelineService));
}

export async function getPipelineService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/pipelineServices/${encodeURIComponent(id)}`,
    { query: { fields: PIPELINE_SERVICE_FIELDS } },
  );
  const mapped = mapPipelineService(raw);
  if (!mapped) {
    throw new Error('Pipeline service response was missing id and name');
  }
  return mapped;
}

export async function createPipelineService(body: CreatePipelineServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/pipelineServices', {
    method: 'POST',
    json: body,
  });
  const mapped = mapPipelineService(raw);
  if (!mapped) {
    throw new Error('Create pipeline service succeeded but the response had no service');
  }
  return mapped;
}

export async function updatePipelineService(body: CreatePipelineServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/pipelineServices', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapPipelineService(raw);
  if (!mapped) {
    throw new Error('Update pipeline service succeeded but the response had no service');
  }
  return mapped;
}

export function deletePipelineService(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/pipelineServices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
