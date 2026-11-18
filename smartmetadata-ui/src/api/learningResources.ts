/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString, parsePaged } from '@/api/json';
import type {
  CreateLearningResourceRequest,
  LearningResource,
  Paged,
} from '@/types/admin';
import { apiRequest } from './client';

export interface LearningResourceContext {
  pageId: string;
  componentId?: string;
  priority?: number;
}

/**
 * The full learning-resource shape the settings page renders. The shared
 * `LearningResource` type carries only the list-card fields; contexts,
 * duration, update time and the source embed config live here so the
 * shared type file stays untouched.
 */
export interface LearningResourceDetail extends LearningResource {
  contexts?: LearningResourceContext[];
  estimatedDuration?: number;
  updatedAt?: number;
  source: { provider?: string; url: string; embedConfig?: Record<string, unknown> };
}

export interface CreateLearningResourcePayload extends CreateLearningResourceRequest {
  contexts?: LearningResourceContext[];
  estimatedDuration?: number;
}

function mapResource(raw: Record<string, unknown>): LearningResourceDetail | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  const resourceType = asString(raw.resourceType);
  const source = asRecord(raw.source) ?? {};
  const url = asString(source.url);
  if (!id || !name || !resourceType || !url) return null;
  const contextsRaw = Array.isArray(raw.contexts) ? raw.contexts : [];
  const contexts = contextsRaw.flatMap((entry): LearningResourceContext[] => {
    const record = asRecord(entry) ?? {};
    const pageId = asString(record.pageId);
    if (!pageId) {
      return [];
    }
    return [
      {
        pageId,
        componentId: asString(record.componentId) || undefined,
        priority: asNumber(record.priority),
      },
    ];
  });
  const embedConfig = asRecord(source.embedConfig) ?? undefined;
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    resourceType,
    categories: Array.isArray(raw.categories) ? raw.categories.map((c) => String(c)) : undefined,
    difficulty: asString(raw.difficulty) || undefined,
    source: {
      provider: asString(source.provider) || undefined,
      url,
      ...(embedConfig ? { embedConfig } : {}),
    },
    contexts: contexts.length > 0 ? contexts : undefined,
    estimatedDuration: asNumber(raw.estimatedDuration),
    updatedAt: asNumber(raw.updatedAt),
    status: asString(raw.status) || undefined,
    deleted: Boolean(raw.deleted),
  };
}

export interface ListLearningResourcesParams {
  limit?: number;
  after?: string;
  before?: string;
  fields?: string;
  search?: string;
  category?: string[];
  pageId?: string[];
  resourceType?: string[];
  status?: string[];
}

export function listLearningResources(
  params?: ListLearningResourcesParams,
): Promise<Paged<LearningResourceDetail>> {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.after) q.set('after', params.after);
  if (params?.before) q.set('before', params.before);
  if (params?.fields) q.set('fields', params.fields);
  if (params?.search) q.set('search', params.search);
  for (const category of params?.category ?? []) q.append('category', category);
  for (const pageId of params?.pageId ?? []) q.append('pageId', pageId);
  for (const type of params?.resourceType ?? []) q.append('resourceType', type);
  for (const status of params?.status ?? []) q.append('status', status);
  const qs = q.toString();
  return apiRequest<unknown>(`/v1/learning/resources${qs ? `?${qs}` : ''}`).then((payload) =>
    parsePaged(payload, mapResource),
  );
}

export function getLearningResourceById(id: string): Promise<LearningResourceDetail> {
  return apiRequest<Record<string, unknown>>(
    `/v1/learning/resources/${encodeURIComponent(id)}`,
  ).then((raw) => {
    const mapped = mapResource(raw);
    if (!mapped) throw new Error('getLearningResourceById missing required fields');
    return mapped;
  });
}

export function createLearningResource(
  body: CreateLearningResourcePayload,
): Promise<LearningResourceDetail> {
  return apiRequest<Record<string, unknown>>('/v1/learning/resources', {
    method: 'POST',
    json: body,
  }).then((raw) => {
    const mapped = mapResource(raw);
    if (!mapped) throw new Error('createLearningResource missing required fields');
    return mapped;
  });
}

/** PUT without an id: create-or-update by name, per the official client. */
export function updateLearningResource(
  body: CreateLearningResourcePayload,
): Promise<LearningResourceDetail> {
  return apiRequest<Record<string, unknown>>('/v1/learning/resources', {
    method: 'PUT',
    json: body,
  }).then((raw) => {
    const mapped = mapResource(raw);
    if (!mapped) throw new Error('updateLearningResource missing required fields');
    return mapped;
  });
}

export function deleteLearningResource(id: string, hardDelete = false): Promise<void> {
  return apiRequest<unknown>(
    `/v1/learning/resources/${encodeURIComponent(id)}?hardDelete=${hardDelete}`,
    { method: 'DELETE' },
  ).then(() => undefined);
}
