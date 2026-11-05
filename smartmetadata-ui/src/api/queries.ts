/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asString, mapEntityRefs } from '@/api/json';
import type { EntityRef } from '@/types/api';
import { apiRequest } from './client';

/**
 * Query entity (openmetadata-spec api/data/createQuery.json + entity/data/query):
 * create requires query + service; the full-screen page reads by id with
 * fields votes + queryUsedIn (official rest/queryAPI.ts, QueryPage).
 */
export interface DataQuery {
  id: string;
  name?: string;
  displayName?: string;
  description?: string;
  query?: string;
  queryDate?: number;
  duration?: number;
  service?: string;
  queryUsedIn?: EntityRef[];
  owners?: EntityRef[];
  followers?: EntityRef[];
  votes?: { upVotes?: number; downVotes?: number };
}

/** Minimal entity references for a create payload (id + type only, per official CreateQuery). */
export interface CreateDataQueryRequest {
  query: string;
  service: string;
  description?: string;
  owners?: Array<{ id: string; type: string }>;
  queryUsedIn?: Array<{ id: string; type: string }>;
  queryDate?: number;
}

function mapQuery(raw: Record<string, unknown>): DataQuery | null {
  const id = asString(raw.id);
  const query = asString(raw.query);
  if (!id && !query) {
    return null;
  }
  const votesRaw = raw.votes && typeof raw.votes === 'object' ? (raw.votes as Record<string, unknown>) : null;
  return {
    id,
    name: asString(raw.name) || undefined,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    query: query || undefined,
    queryDate: asNumber(raw.queryDate),
    duration: asNumber(raw.duration),
    service: asString(raw.service) || undefined,
    queryUsedIn: mapEntityRefs(raw.queryUsedIn),
    owners: mapEntityRefs(raw.owners),
    followers: mapEntityRefs(raw.followers),
    votes: votesRaw
      ? { upVotes: asNumber(votesRaw.upVotes), downVotes: asNumber(votesRaw.downVotes) }
      : undefined,
  };
}

/** Official getQueryById: GET /v1/queries/{id}?fields=votes,queryUsedIn. */
export async function getQueryById(id: string): Promise<DataQuery> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/queries/${encodeURIComponent(id)}`, {
    query: { fields: 'votes,queryUsedIn' },
  });
  const mapped = mapQuery(raw);
  if (!mapped) {
    throw new Error('Query response was missing id and query text');
  }
  return mapped;
}

/** Official postQuery: POST /v1/queries. */
export async function postQuery(body: CreateDataQueryRequest): Promise<DataQuery> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/queries', {
    method: 'POST',
    json: body,
  });
  const mapped = mapQuery(raw);
  if (!mapped) {
    throw new Error('Create query succeeded but the response had no query');
  }
  return mapped;
}
