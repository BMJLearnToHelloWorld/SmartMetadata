/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString, parsePaged } from '@/api/json';
import type { AdminApp, Paged } from '@/types/admin';
import { apiRequest } from './client';

export interface ListAppsQuery {
  limit?: number;
  after?: string;
}

export function mapApp(raw: Record<string, unknown>): AdminApp | null {
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
    deleted: asBoolean(raw.deleted),
    appType: asString(raw.appType) || undefined,
    scheduleType: asString(raw.scheduleType) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
  };
}

/** Apache AppResource list — GET /v1/apps. No marketplace invent. */
export function listApps(query: ListAppsQuery = {}): Promise<Paged<AdminApp>> {
  return apiRequest<unknown>('/v1/apps', {
    query: {
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapApp));
}

export async function getApp(id: string): Promise<AdminApp> {
  const raw = await apiRequest<unknown>(`/v1/apps/${encodeURIComponent(id)}`);
  const rec = asRecord(raw);
  const mapped = rec ? mapApp(rec) : null;
  if (!mapped) {
    throw new Error('App response was missing id and name');
  }
  return mapped;
}
