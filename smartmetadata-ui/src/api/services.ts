/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import { apiRequest } from './client';

/**
 * Service health, mirroring the generated ServiceHealth enum
 * (openmetadata-spec schema/api/services/servicesOverview.json):
 * worst-wins `failed` > `partialSuccess` > `success`; a service with no
 * pipelines, or whose pipelines have only non-terminal runs, is
 * `notRun`. These lowercase wire values are what the server binds —
 * the official UI sends ServiceHealth.Failed = "failed", never the
 * PascalCase member name.
 */
export type ServiceHealth = 'failed' | 'partialSuccess' | 'success' | 'notRun';

export interface ServiceSummary {
  id: string;
  entityType: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  serviceType?: string;
  owners?: EntityRef[];
  tags?: EntityRef[];
  updatedAt?: number;
  deleted?: boolean;
  /** Present only when includeHealth is true. */
  health?: ServiceHealth;
}

export interface ServicesOverview {
  counts?: Record<string, number>;
  serviceTypeCounts?: Record<string, number>;
  healthCounts?: Record<string, Record<string, number>>;
  total: number;
  data: ServiceSummary[];
  /** Cursor/total of the underlying page, flattened from Paged<T>. */
  paging?: Pick<Paged<ServiceSummary>, 'after' | 'before' | 'total'>;
}

export interface ServicesOverviewParams {
  entityType?: string[];
  listEntityType?: string[];
  serviceType?: string[];
  /** Repeatable: the server binds a Set<ServiceHealth>. */
  health?: ServiceHealth[];
  includeHealth?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
  sortOrder?: 'asc' | 'desc';
  include?: string;
  domain?: string;
  excludeProvider?: 'system' | 'user' | 'automation';
}

function mapServiceSummary(raw: Record<string, unknown>): ServiceSummary | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) {
    return null;
  }
  const health = asString(raw.health);
  const mapped: ServiceSummary = {
    id,
    entityType: asString(raw.entityType),
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
    serviceType: asString(raw.serviceType) || undefined,
    owners: mapEntityRefs(raw.owners),
    tags: mapEntityRefs(raw.tags),
    updatedAt: asNumber(raw.updatedAt) || undefined,
    deleted: typeof raw.deleted === 'boolean' ? raw.deleted : undefined,
    health:
      health === 'failed' || health === 'partialSuccess' || health === 'success' || health === 'notRun'
        ? health
        : undefined,
  };
  return mapped;
}

/**
 * Official serviceAPI.getServicesOverview (rest/serviceAPI.ts): GET
 * /v1/services/overview. The shared client serializes arrays as a
 * single comma-joined value, but the repeatable params bind to JAX-RS
 * Set<> and need `key=a&key=b` — official passes
 * `paramsSerializer: { indexes: null }` for exactly this reason, so
 * this client builds the query string by hand with append() and never
 * String()s an array (REVIEW-W2-G11-BC condition 4).
 * ADR:2026-11-08-my-data-thin-clients-services-overview-repeat-params
 */
export async function getServicesOverview(params: ServicesOverviewParams = {}): Promise<ServicesOverview> {
  const search = new URLSearchParams();
  const appendAll = (key: string, values: string[] | undefined): void => {
    for (const value of values ?? []) {
      search.append(key, value);
    }
  };
  appendAll('entityType', params.entityType);
  appendAll('listEntityType', params.listEntityType);
  appendAll('serviceType', params.serviceType);
  appendAll('health', params.health);
  if (params.includeHealth !== undefined) {
    search.set('includeHealth', String(params.includeHealth));
  }
  if (params.q !== undefined) {
    search.set('q', params.q);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  if (params.offset !== undefined) {
    search.set('offset', String(params.offset));
  }
  if (params.sortOrder !== undefined) {
    search.set('sortOrder', params.sortOrder);
  }
  if (params.include !== undefined) {
    search.set('include', params.include);
  }
  if (params.domain !== undefined) {
    search.set('domain', params.domain);
  }
  if (params.excludeProvider !== undefined) {
    search.set('excludeProvider', params.excludeProvider);
  }
  const query = search.toString();
  const payload = await apiRequest<unknown>(`/v1/services/overview${query ? `?${query}` : ''}`);
  const page = parsePaged(payload, mapServiceSummary);
  const root = asRecord(payload);
  const asCountMap = (value: unknown): Record<string, number> | undefined => {
    const rec = asRecord(value);
    if (!rec) {
      return undefined;
    }
    const out: Record<string, number> = {};
    for (const [key, entry] of Object.entries(rec)) {
      out[key] = asNumber(entry) ?? 0;
    }
    return out;
  };
  const asHealthMap = (value: unknown): Record<string, Record<string, number>> | undefined => {
    const rec = asRecord(value);
    if (!rec) {
      return undefined;
    }
    const out: Record<string, Record<string, number>> = {};
    for (const [key, entry] of Object.entries(rec)) {
      const mapped = asCountMap(entry);
      if (mapped) {
        out[key] = mapped;
      }
    }
    return out;
  };
  return {
    counts: asCountMap(root?.counts),
    serviceTypeCounts: asCountMap(root?.serviceTypeCounts),
    healthCounts: asHealthMap(root?.healthCounts),
    total: page.total ?? page.data.length,
    data: page.data,
    paging: { total: page.total, after: page.after, before: page.before },
  };
}
