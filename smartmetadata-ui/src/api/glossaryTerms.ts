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
import type { EntityRef } from '@/types/api';
import type { CreateGlossaryTermRequest, GlossaryTerm } from '@/types/governance';
import { apiRequest } from './client';
import { mapTags } from './entities';

export const GLOSSARY_TERM_FIELDS =
  'children,relatedTerms,reviewers,owners,tags,usageCount,domains,childrenCount,entityStatus';

export interface ListGlossaryTermsQuery {
  glossary?: string;
  parent?: string;
  limit?: number;
  after?: string;
}

function mapRelatedTerms(value: unknown): EntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === 'string') {
      return item ? [{ name: item, fullyQualifiedName: item, type: 'glossaryTerm' }] : [];
    }
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const nested = asRecord(rec.term);
    return mapEntityRefs(nested ? [nested] : [rec]);
  });
}

function mapTerm(raw: Record<string, unknown>): GlossaryTerm | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const glossaryRefs = mapEntityRefs(raw.glossary ? [raw.glossary] : []);
  const parentRefs = mapEntityRefs(raw.parent ? [raw.parent] : []);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    glossary: glossaryRefs[0],
    parent: parentRefs[0],
    mutuallyExclusive: asBoolean(raw.mutuallyExclusive),
    relatedTerms: mapRelatedTerms(raw.relatedTerms),
    owners: mapEntityRefs(raw.owners),
    tags: mapTags(raw.tags),
    children: mapEntityRefs(raw.children),
    usageCount: asNumber(raw.usageCount),
    status: asString(raw.entityStatus) || asString(raw.status) || undefined,
  };
}

export function listGlossaryTerms(query: ListGlossaryTermsQuery = {}): Promise<Paged<GlossaryTerm>> {
  return apiRequest<unknown>('/v1/glossaryTerms', {
    query: {
      fields: GLOSSARY_TERM_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
      glossary: query.glossary,
      parent: query.parent,
    },
  }).then((payload) => parsePaged(payload, mapTerm));
}

export async function getGlossaryTerm(id: string): Promise<GlossaryTerm> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/glossaryTerms/${encodeURIComponent(id)}`,
    { query: { fields: GLOSSARY_TERM_FIELDS } },
  );
  const mapped = mapTerm(raw);
  if (!mapped) {
    throw new Error('Glossary term response was missing id and name');
  }
  return mapped;
}

export async function createGlossaryTerm(body: CreateGlossaryTermRequest): Promise<GlossaryTerm> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaryTerms', {
    method: 'POST',
    json: body,
  });
  const mapped = mapTerm(raw);
  if (!mapped) {
    throw new Error('Create glossary term succeeded but the response had no term');
  }
  return mapped;
}

export async function updateGlossaryTerm(body: CreateGlossaryTermRequest): Promise<GlossaryTerm> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaryTerms', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapTerm(raw);
  if (!mapped) {
    throw new Error('Update glossary term succeeded but the response had no term');
  }
  return mapped;
}

export function listGlossaryTermAssets(id: string, limit = 25): Promise<Paged<EntityRef>> {
  return apiRequest<unknown>(`/v1/glossaryTerms/${encodeURIComponent(id)}/assets`, {
    query: { limit },
  }).then((payload) => parsePaged(payload, (raw) => mapEntityRefs([raw])[0] ?? null));
}

export interface DeleteEntityOptions {
  hardDelete?: boolean;
  recursive?: boolean;
}

/**
 * Official term delete via the generic deleteEntity surface (rest/miscAPI.ts);
 * the ontology-impact POST delete (rest/ontologyAPI.ts) needs an ontology
 * surface the product does not have, so it is not used here.
 */
export function deleteGlossaryTerm(id: string, options: DeleteEntityOptions = {}): Promise<unknown> {
  return apiRequest(`/v1/glossaryTerms/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: options.hardDelete, recursive: options.recursive },
  });
}
