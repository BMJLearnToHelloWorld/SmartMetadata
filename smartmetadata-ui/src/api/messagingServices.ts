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
import type { CatalogService, CreateMessagingServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const MESSAGING_SERVICE_FIELDS = 'owners';

export interface ListMessagingServicesQuery {
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

export function mapMessagingService(raw: Record<string, unknown>): CatalogService | null {
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
    kind: 'messaging',
    serviceType: asString(raw.serviceType),
    connection: mapConnection(raw.connection),
  };
}

export function listMessagingServices(query: ListMessagingServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/messagingServices', {
    query: {
      fields: MESSAGING_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapMessagingService));
}

export async function getMessagingService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/messagingServices/${encodeURIComponent(id)}`,
    { query: { fields: MESSAGING_SERVICE_FIELDS } },
  );
  const mapped = mapMessagingService(raw);
  if (!mapped) {
    throw new Error('Messaging service response was missing id and name');
  }
  return mapped;
}

export async function createMessagingService(body: CreateMessagingServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/messagingServices', {
    method: 'POST',
    json: body,
  });
  const mapped = mapMessagingService(raw);
  if (!mapped) {
    throw new Error('Create messaging service succeeded but the response had no service');
  }
  return mapped;
}

export async function updateMessagingService(body: CreateMessagingServiceRequest): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/messagingServices', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapMessagingService(raw);
  if (!mapped) {
    throw new Error('Update messaging service succeeded but the response had no service');
  }
  return mapped;
}

export function deleteMessagingService(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/messagingServices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
