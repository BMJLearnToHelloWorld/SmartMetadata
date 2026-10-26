/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { CreateGlossaryRequest, Glossary } from '@/types/governance';
import { apiRequest } from './client';
import { mapTags } from './entities';

export const GLOSSARY_FIELDS = 'owners,tags,reviewers,usageCount,termCount,domains';

export interface ListGlossariesQuery {
  limit?: number;
  after?: string;
}

function mapGlossary(raw: Record<string, unknown>): Glossary | null {
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
    mutuallyExclusive: asBoolean(raw.mutuallyExclusive),
    termCount: asNumber(raw.termCount),
    owners: mapEntityRefs(raw.owners),
    reviewers: mapEntityRefs(raw.reviewers),
    tags: mapTags(raw.tags),
    domains: mapEntityRefs(raw.domains),
  };
}

export function listGlossaries(query: ListGlossariesQuery = {}): Promise<Paged<Glossary>> {
  return apiRequest<unknown>('/v1/glossaries', {
    query: {
      fields: GLOSSARY_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapGlossary));
}

export async function getGlossary(id: string): Promise<Glossary> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/glossaries/${encodeURIComponent(id)}`, {
    query: { fields: GLOSSARY_FIELDS },
  });
  const mapped = mapGlossary(raw);
  if (!mapped) {
    throw new Error('Glossary response was missing id and name');
  }
  return mapped;
}

export async function createGlossary(body: CreateGlossaryRequest): Promise<Glossary> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaries', {
    method: 'POST',
    json: body,
  });
  const mapped = mapGlossary(raw);
  if (!mapped) {
    throw new Error('Create glossary succeeded but the response had no glossary');
  }
  return mapped;
}

export async function updateGlossary(body: CreateGlossaryRequest): Promise<Glossary> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaries', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapGlossary(raw);
  if (!mapped) {
    throw new Error('Update glossary succeeded but the response had no glossary');
  }
  return mapped;
}
