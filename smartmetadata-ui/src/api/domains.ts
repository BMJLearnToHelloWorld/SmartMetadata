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
import type { Paged } from '@/types/admin';
import type { EntityRef, SearchHit } from '@/types/api';
import type { CreateDomainRequest, Domain } from '@/types/governance';
import { apiRequest } from './client';
import { searchAssets } from './search';
import { addBulkAssets, removeBulkAssets, type BulkAssetResult } from './bulkAssets';
import { mapCertification, mapTags } from './entities';

export type { BulkAssetResult };

export const DOMAIN_FIELDS = 'tags,children,childrenCount,owners,experts,extension,certification';

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
  const children = mapEntityRefs(raw.children);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    domainType: asString(raw.domainType) || 'Source-aligned',
    deleted: asBoolean(raw.deleted),
    parent: parentRefs[0],
    owners: mapEntityRefs(raw.owners),
    experts: mapEntityRefs(raw.experts),
    tags: mapTags(raw.tags),
    // D-2 batch 2: pin reads the certification field, not the
    // `Certification.*` tag in `tags`.
    certification: mapCertification(asRecord(raw.certification)),
    extension:
      raw.extension && typeof raw.extension === 'object'
        ? (raw.extension as Record<string, unknown>)
        : undefined,
    // The domain list renders flat: a truthy empty children array would draw
    // a dead expand icon on every row, so childless domains carry no key.
    // Sub-domains are shown on the detail page, not as nested list rows.
    children: children.length ? children : undefined,
    childrenCount: asNumber(raw.childrenCount) || undefined,
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

/**
 * G2 search (pin domainAPI.searchDomains, rest/domainAPI.ts:165): the ES
 * domain index, same shape as G3's searchDataProducts — `searchAssets`
 * with `index: 'domain'`, hits mapped back to Domain. Pin wraps the term
 * in wildcards (`q=*<term>*`); the product's searchAssets already defaults
 * an empty query to `*` and the ES query_string handles the term, so the
 * term is passed as-is.
 */
export async function searchDomains(
  query: string,
  from = 0,
  size = 25,
): Promise<Paged<Domain>> {
  const page = await searchAssets(query, from, size, { index: 'domain' });
  return {
    data: page.hits.flatMap((hit: SearchHit) => {
      const domain = hitToDomain(hit);
      return domain ? [domain] : [];
    }),
    total: page.total,
  };
}

function hitToDomain(hit: SearchHit): Domain | null {
  if (!hit.id && !hit.name) {
    return null;
  }
  return {
    id: hit.id ?? hit.fullyQualifiedName,
    name: hit.name,
    displayName: hit.displayName,
    description: hit.description,
    fullyQualifiedName: hit.fullyQualifiedName || hit.name,
    domainType: hit.domainType || 'Source-aligned',
    parent: hit.parent,
    owners: hit.owners ?? [],
    experts: [],
    tags: hit.tags ?? [],
    childrenCount: hit.childrenCount,
  };
}

export interface DomainChildrenPage {
  data: Domain[];
  total?: number;
}

/**
 * G2 tree (pin domainAPI.getDomainChildrenPaginated,
 * rest/domainAPI.ts:140): GET /v1/domains/hierarchy — roots when no parent
 * is given, otherwise the direct children of that fqn. Offset-paged;
 * pin's page size is 15. The endpoint exists in the product server
 * (deploy checkout DomainResource.java:666 `@Path("/hierarchy")`,
 * `:698 directChildrenOf`), so no Java port is needed.
 */
export function listDomainChildren(
  parentFqn?: string,
  offset = 0,
  limit = 15,
): Promise<DomainChildrenPage> {
  return apiRequest<unknown>('/v1/domains/hierarchy', {
    query: {
      fields: 'parent,childrenCount',
      limit,
      offset,
      directChildrenOf: parentFqn,
    },
  }).then((payload) => {
    const page = parsePaged(payload, mapDomain);
    return { data: page.data, total: page.total };
  });
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

/**
 * Official getDomainByName (rest/domainAPI.ts): GET /v1/domains/name/{name}.
 * The marketplace announcement widget only carries the fqn, so this is
 * the fqn→id resolution for its click-through.
 */
export async function getDomainByName(name: string): Promise<Domain> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/domains/name/${encodeURIComponent(name)}`,
    { query: { fields: DOMAIN_FIELDS } },
  );
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

/**
 * Domain bulk asset writes (DomainResource /{name}/assets/add|remove):
 * same BulkAssets contract and EDIT_ALL authorization as data products.
 */
export function addDomainAssets(
  fqn: string,
  assets: EntityRef[],
  options?: { dryRun?: boolean },
): Promise<BulkAssetResult> {
  return addBulkAssets('domains', fqn, assets, options);
}

export function removeDomainAssets(fqn: string, assets: EntityRef[]): Promise<BulkAssetResult> {
  return removeBulkAssets('domains', fqn, assets);
}

/**
 * Generic entity JSON Patch for custom-property (extension) edits on a
 * domain — same contract note as patchDataProduct in api/dataProducts.ts.
 */
export function patchDomain(id: string, patch: unknown[]): Promise<unknown> {
  return apiRequest(`/v1/domains/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
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

/**
 * Official domainAPI.getAllDomainsWithAssetsCount
 * (rest/domainAPI.ts): GET /v1/domains/assets/counts, a whole-table
 * Map<fqn, count> — the Domains widget reads counts from here, never
 * by paging the domain list.
 */
export async function getAllDomainsWithAssetsCount(): Promise<Record<string, number>> {
  const payload = await apiRequest<unknown>('/v1/domains/assets/counts');
  const root = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
  const out: Record<string, number> = {};
  if (root) {
    for (const [key, value] of Object.entries(root)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value;
      }
    }
  }
  return out;
}
