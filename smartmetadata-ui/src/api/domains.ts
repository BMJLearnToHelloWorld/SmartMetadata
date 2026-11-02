/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import type { CreateDomainRequest, Domain } from '@/types/governance';
import { apiRequest } from './client';
import { mapTags } from './entities';

export const DOMAIN_FIELDS = 'tags,children,childrenCount,owners,experts';

export interface ListDomainsQuery {
  limit?: number;
  after?: string;
}

function mapDomain(raw: Record<string, unknown>): Domain | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const parentRefs = mapEntityRefs(raw.parent ? [raw.parent] : []);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    domainType: asString(raw.domainType) || 'Source-aligned',
    parent: parentRefs[0],
    owners: mapEntityRefs(raw.owners),
    experts: mapEntityRefs(raw.experts),
    tags: mapTags(raw.tags),
    children: mapEntityRefs(raw.children),
  };
}

export function listDomains(query: ListDomainsQuery = {}): Promise<Paged<Domain>> {
  return apiRequest<unknown>('/v1/domains', {
    query: {
      fields: DOMAIN_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapDomain));
}

export async function getDomain(id: string): Promise<Domain> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/domains/${encodeURIComponent(id)}`, {
    query: { fields: DOMAIN_FIELDS },
  });
  const mapped = mapDomain(raw);
  if (!mapped) {
    throw new Error('Domain response was missing id and name');
  }
  return mapped;
}

export async function createDomain(body: CreateDomainRequest): Promise<Domain> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/domains', {
    method: 'POST',
    json: body,
  });
  const mapped = mapDomain(raw);
  if (!mapped) {
    throw new Error('Create domain succeeded but the response had no domain');
  }
  return mapped;
}

export async function updateDomain(body: CreateDomainRequest): Promise<Domain> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/domains', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapDomain(raw);
  if (!mapped) {
    throw new Error('Update domain succeeded but the response had no domain');
  }
  return mapped;
}

export function listDomainAssets(id: string, limit = 25): Promise<Paged<EntityRef>> {
  return apiRequest<unknown>(`/v1/domains/${encodeURIComponent(id)}/assets`, {
    query: { limit },
  }).then((payload) => parsePaged(payload, (raw) => mapEntityRefs([raw])[0] ?? null));
}

export interface DeleteEntityOptions {
  hardDelete?: boolean;
  recursive?: boolean;
}

/** Official generic deleteEntity (rest/miscAPI.ts) applied to domains. */
export function deleteDomain(id: string, options: DeleteEntityOptions = {}): Promise<unknown> {
  return apiRequest(`/v1/domains/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: options.hardDelete, recursive: options.recursive },
  });
}
