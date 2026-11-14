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

/**
 * Official applicationAPI getApplicationByName: GET /v1/apps/name/{name}.
 * The marketplace detail page uses it only as an installed probe
 * (success means installed, any failure means not installed), mirroring
 * official's fetchInstalledAppDetails, which swallows the error.
 */
export async function getAppByName(name: string): Promise<AdminApp> {
  const raw = await apiRequest<unknown>(`/v1/apps/name/${encodeURIComponent(name)}`, {
    query: { fields: 'owners', include: 'all' },
  });
  const rec = asRecord(raw);
  const mapped = rec ? mapApp(rec) : null;
  if (!mapped) {
    throw new Error('App response was missing id and name');
  }
  return mapped;
}

/**
 * Trigger an on-demand application run, ported from official
 * rest/applicationAPI.ts `triggerOnDemandApp` (pin a3012259ca):
 * POST /v1/apps/trigger/{name} with the trigger payload (for
 * AutoPilot, `{ entityLink }`). The server answers an empty 200,
 * which apiRequest returns as undefined; callers only await/catch.
 */
export async function triggerOnDemandApp(
  name: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await apiRequest(`/v1/apps/trigger/${encodeURIComponent(name)}`, { json: data ?? {} });
}
