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
import type { CatalogService, CreateDashboardServiceRequest, ServiceConnection } from '@/types/ingestion';
import { apiRequest } from './client';

export const DASHBOARD_SERVICE_FIELDS = 'owners';

export interface ListDashboardServicesQuery {
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
    connection: mapConnection(raw.connection),
  };
}

export function listDashboardServices(query: ListDashboardServicesQuery = {}): Promise<Paged<CatalogService>> {
  return apiRequest<unknown>('/v1/services/dashboardServices', {
    query: {
      fields: DASHBOARD_SERVICE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapDashboardService));
}

export async function getDashboardService(id: string): Promise<CatalogService> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/dashboardServices/${encodeURIComponent(id)}`,
    { query: { fields: DASHBOARD_SERVICE_FIELDS } },
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

export function deleteDashboardService(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/dashboardServices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
