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
  /** Direct-children-of filter (parent term FQN), the official lazy-children
   *  parameter (GlossaryTermResource list accepts directChildrenOf + after). */
  directChildrenOf?: string;
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

/**
 * Child rows arrive as EntityReferences, which carry a description but no
 * status or owners; keeping the description is what lets an expanded child
 * row show more than its name. The shared ref mapper drops it, so children
 * are mapped here instead of through mapEntityRefs.
 */
function mapTermChildren(value: unknown): Array<EntityRef & { description?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.name) || asString(rec.displayName) || asString(rec.fullyQualifiedName);
    const id = asString(rec.id);
    if (!name && !id) {
      return [];
    }
    return [
      {
        id: id || undefined,
        name: name || id,
        displayName: asString(rec.displayName) || undefined,
        type: asString(rec.type) || undefined,
        fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
        description: asString(rec.description) || undefined,
      },
    ];
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
  const children = mapTermChildren(raw.children);
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
    // Ant Table draws an expand icon for any truthy children value and an
    // empty array is truthy, so childless terms must carry no children key
    // at all rather than an empty list.
    children: children.length ? children : undefined,
    childrenCount: asNumber(raw.childrenCount) || undefined,
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
      directChildrenOf: query.directChildrenOf,
    },
  }).then((payload) => parsePaged(payload, mapTerm));
}

/**
 * Official getGlossaryTermChildrenLazy (rest/glossaryAPI.ts): GET
 * /v1/glossaryTerms?directChildrenOf={parentFqn}&limit=50&after={cursor}.
 * Unlike the embedded `children` refs of a list response (name + description
 * only), each page carries full terms — status, owners, and their own
 * childrenCount — so an expanded child row shows the same columns as a
 * top-level row, and its own children lazy-load on expand in turn.
 */
export function listGlossaryTermChildrenLazy(
  parentFqn: string,
  limit = 50,
  after?: string,
): Promise<Paged<GlossaryTerm>> {
  return listGlossaryTerms({ directChildrenOf: parentFqn, limit, after });
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
