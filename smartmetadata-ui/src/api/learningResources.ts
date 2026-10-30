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
import type { CreateLearningResourceRequest, LearningResource, Paged } from '@/types/admin';
import { apiRequest } from './client';

function mapResource(raw: Record<string, unknown>): LearningResource | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  const resourceType = asString(raw.resourceType);
  const source = asRecord(raw.source) ?? {};
  const url = asString(source.url);
  if (!id || !name || !resourceType || !url) return null;
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    resourceType,
    categories: Array.isArray(raw.categories) ? raw.categories.map((c) => String(c)) : undefined,
    difficulty: asString(raw.difficulty) || undefined,
    source: { provider: asString(source.provider) || undefined, url },
    status: asString(raw.status) || undefined,
    deleted: Boolean(raw.deleted),
  };
}

export function listLearningResources(params?: {
  limit?: number;
  after?: string;
}): Promise<Paged<LearningResource>> {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.after) q.set('after', params.after);
  const qs = q.toString();
  return apiRequest<unknown>(`/v1/learning/resources${qs ? `?${qs}` : ''}`).then((payload) =>
    parsePaged(payload, mapResource),
  );
}

export function createLearningResource(body: CreateLearningResourceRequest): Promise<LearningResource> {
  return apiRequest<Record<string, unknown>>('/v1/learning/resources', {
    method: 'POST',
    json: body,
  }).then((raw) => {
    const mapped = mapResource(raw);
    if (!mapped) throw new Error('createLearningResource missing required fields');
    return mapped;
  });
}

export function deleteLearningResource(id: string): Promise<void> {
  return apiRequest<unknown>(`/v1/learning/resources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).then(() => undefined);
}
