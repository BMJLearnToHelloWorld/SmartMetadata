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
import type { ClassificationTag, CreateTagRequest } from '@/types/governance';
import { apiRequest } from './client';

export const TAG_FIELDS = 'owners,reviewers,domains,children,usageCount';

export interface ListTagsQuery {
  parent?: string;
  limit?: number;
  after?: string;
}

function mapTag(raw: Record<string, unknown>): ClassificationTag | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const classificationRefs = mapEntityRefs(raw.classification ? [raw.classification] : []);
  const parentRefs = mapEntityRefs(raw.parent ? [raw.parent] : []);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    classification: classificationRefs[0],
    parent: parentRefs[0],
    mutuallyExclusive: asBoolean(raw.mutuallyExclusive),
    usageCount: asNumber(raw.usageCount),
    owners: mapEntityRefs(raw.owners),
  };
}

export function listTags(query: ListTagsQuery = {}): Promise<Paged<ClassificationTag>> {
  return apiRequest<unknown>('/v1/tags', {
    query: {
      fields: TAG_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
      parent: query.parent,
    },
  }).then((payload) => parsePaged(payload, mapTag));
}

export async function getTag(id: string): Promise<ClassificationTag> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tags/${encodeURIComponent(id)}`, {
    query: { fields: TAG_FIELDS },
  });
  const mapped = mapTag(raw);
  if (!mapped) {
    throw new Error('Tag response was missing id and name');
  }
  return mapped;
}

export async function createTag(body: CreateTagRequest): Promise<ClassificationTag> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/tags', {
    method: 'POST',
    json: body,
  });
  const mapped = mapTag(raw);
  if (!mapped) {
    throw new Error('Create tag succeeded but the response had no tag');
  }
  return mapped;
}

export async function updateTag(body: CreateTagRequest): Promise<ClassificationTag> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/tags', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapTag(raw);
  if (!mapped) {
    throw new Error('Update tag succeeded but the response had no tag');
  }
  return mapped;
}
