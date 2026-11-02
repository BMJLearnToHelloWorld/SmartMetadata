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
import type { Classification, CreateClassificationRequest } from '@/types/governance';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { apiRequest } from './client';

export const CLASSIFICATION_FIELDS = 'owners,reviewers,usageCount,termCount';

export interface ListClassificationsQuery {
  limit?: number;
  after?: string;
}

function mapClassification(raw: Record<string, unknown>): Classification | null {
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
    disabled: asBoolean(raw.disabled),
    owners: mapEntityRefs(raw.owners),
  };
}

export function listClassifications(
  query: ListClassificationsQuery = {},
): Promise<Paged<Classification>> {
  return apiRequest<unknown>('/v1/classifications', {
    query: {
      fields: CLASSIFICATION_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapClassification));
}

export async function getClassification(id: string): Promise<Classification> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/classifications/${encodeURIComponent(id)}`,
    { query: { fields: CLASSIFICATION_FIELDS } },
  );
  const mapped = mapClassification(raw);
  if (!mapped) {
    throw new Error('Classification response was missing id and name');
  }
  return mapped;
}

export async function createClassification(body: CreateClassificationRequest): Promise<Classification> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/classifications', {
    method: 'POST',
    json: body,
  });
  const mapped = mapClassification(raw);
  if (!mapped) {
    throw new Error('Create classification succeeded but the response had no classification');
  }
  return mapped;
}

export async function updateClassification(body: CreateClassificationRequest): Promise<Classification> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/classifications', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapClassification(raw);
  if (!mapped) {
    throw new Error('Update classification succeeded but the response had no classification');
  }
  return mapped;
}

/** Official deleteClassification (rest/tagAPI.ts): recursive=true&hardDelete=true. */
export function deleteClassification(id: string): Promise<unknown> {
  return apiRequest(`/v1/classifications/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { recursive: true, hardDelete: true },
  });
}

/** Official patchClassification (rest/tagAPI.ts): JSON Patch. */
export async function patchClassification(id: string, patch: JsonPatchOp[]): Promise<Classification> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/classifications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  const mapped = mapClassification(raw);
  if (!mapped) {
    throw new Error('Patch classification succeeded but the response had no classification');
  }
  return mapped;
}
