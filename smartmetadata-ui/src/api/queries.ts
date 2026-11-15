/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { asNumber, asRecord, asString, mapEntityRef, mapEntityRefs } from '@/api/json';
import { resolvePatchPath, resolveVotePath } from '@/catalog/entityRoutes';
import type { EntityRef, EntityVotes, TagLabelState, TagLabelType, TagRef } from '@/types/api';
import { apiRequest } from './client';

/** Official vote type (openmetadata-spec type/votes.json#/definitions/voteType). */
export type VoteType = 'votedUp' | 'votedDown' | 'unVoted';

/**
 * Query entity (openmetadata-spec entity/data/query.json + the pin
 * TableQueries surface): the tab renders query text, date, duration,
 * used-in tables, votes with voter lists, owners, description, tags,
 * users, and used-by. `service` is the server's EntityReference — an
 * earlier mapping read it as a string and always produced undefined.
 */
export interface DataQuery {
  id: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  query?: string;
  queryDate?: number;
  duration?: number;
  service?: EntityRef;
  queryUsedIn?: EntityRef[];
  owners?: EntityRef[];
  followers?: EntityRef[];
  users?: EntityRef[];
  usedBy?: string[];
  tags?: TagRef[];
  votes?: EntityVotes;
  updatedAt?: number;
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

/**
 * Pin vote-refetch field set (TableQueries.tsx: the getQueryById call after
 * a vote): owners, votes, tags, queryUsedIn, users, in that order. The
 * right panel hydrates with the same set.
 */
export const FULL_QUERY_FIELDS = 'owners,votes,tags,queryUsedIn,users';

export interface QuerySearchPage {
  total: number;
  queries: DataQuery[];
}

const TAG_LABEL_TYPES: TagLabelType[] = ['Automated', 'Derived', 'Generated', 'Manual', 'Propagated'];

function mapQueryTags(value: unknown): TagRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const tagFQN = asString(rec.tagFQN);
    const name = asString(rec.name) || tagFQN;
    const source = asString(rec.source);
    const labelType = asString(rec.labelType);
    const state = asString(rec.state);
    if (!name && !tagFQN) {
      return [];
    }
    return [
      {
        tagFQN: tagFQN || name,
        name: name || tagFQN,
        source: source === 'Glossary' || source === 'Classification' ? source : undefined,
        labelType: TAG_LABEL_TYPES.includes(labelType as TagLabelType)
          ? (labelType as TagLabelType)
          : undefined,
        // A carried Suggested state must survive a round trip: dropping
        // it would let a later save rewrite the label to Confirmed.
        state:
          state === 'Suggested' || state === 'Confirmed'
            ? (state as TagLabelState)
            : undefined,
      },
    ];
  });
}

function mapQueryService(value: unknown): EntityRef | undefined {
  const ref = mapEntityRef(value);
  if (ref) {
    return ref;
  }
  // Defensive: fixtures and older payloads may carry the service name as a
  // bare string; the server contract is an EntityReference object.
  return typeof value === 'string' && value ? { name: value } : undefined;
}

function mapStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function mapQuery(raw: Record<string, unknown>): DataQuery | null {
  const id = asString(raw.id);
  const query = asString(raw.query);
  if (!id && !query) {
    return null;
  }
  const votesRaw = asRecord(raw.votes);
  return {
    id,
    name: asString(raw.name) || undefined,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
    query: query || undefined,
    queryDate: asNumber(raw.queryDate),
    duration: asNumber(raw.duration),
    service: mapQueryService(raw.service),
    queryUsedIn: mapEntityRefs(raw.queryUsedIn),
    owners: mapEntityRefs(raw.owners),
    followers: mapEntityRefs(raw.followers),
    users: mapEntityRefs(raw.users),
    usedBy: mapStringList(raw.usedBy),
    tags: mapQueryTags(raw.tags),
    votes: votesRaw
      ? {
          upVotes: asNumber(votesRaw.upVotes) ?? 0,
          downVotes: asNumber(votesRaw.downVotes) ?? 0,
          upVoters: mapEntityRefs(votesRaw.upVoters),
          downVoters: mapEntityRefs(votesRaw.downVoters),
        }
      : undefined,
    updatedAt: asNumber(raw.updatedAt),
  };
}

/**
 * Maps a GET /v1/search/query response with index=query: each hit's
 * `_source` is a Query document (the pin maps `hit._source` directly),
 * and the total comes from `hits.total.value`.
 */
export function mapQuerySearchPage(payload: unknown): QuerySearchPage {
  const root = asRecord(payload);
  const hitsNode = asRecord(root?.hits);
  if (!hitsNode || !Array.isArray(hitsNode.hits)) {
    return { total: 0, queries: [] };
  }
  const totalRaw = hitsNode.total;
  const total =
    typeof totalRaw === 'number'
      ? totalRaw
      : (asNumber(asRecord(totalRaw)?.value) ?? 0);
  const queries = hitsNode.hits.flatMap((rawHit) => {
    const source = asRecord(asRecord(rawHit)?._source);
    if (!source) {
      return [];
    }
    const mapped = mapQuery(source);
    return mapped ? [mapped] : [];
  });
  return { total, queries };
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

/** Full-field read for the right panel and the post-vote refetch. */
export async function getQueryDetails(id: string): Promise<DataQuery> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/queries/${encodeURIComponent(id)}`, {
    query: { fields: FULL_QUERY_FIELDS },
  });
  const mapped = mapQuery(raw);
  if (!mapped) {
    throw new Error('Query response was missing id and query text');
  }
  return mapped;
}

/**
 * Pin `tableQueryCountFn`: the tab count badge is the REST list with
 * `limit=0` + `entityId`, which returns only `paging.total`. `entityType`
 * is passed as well, matching the documented contract and the
 * authorization path (the pin passes only entityId for the count).
 */
export async function getQueryCount(tableId: string): Promise<number> {
  const payload = await apiRequest<unknown>('/v1/queries', {
    query: { limit: 0, entityId: tableId, entityType: 'table' },
  });
  return asNumber(asRecord(asRecord(payload)?.paging)?.total) ?? 0;
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

/** Official patchQueries: PATCH /v1/queries/{id} with a JSON Patch body. */
export async function patchQuery(id: string, patch: JsonPatchOp[]): Promise<DataQuery> {
  const path = resolvePatchPath('query', id);
  if (!path) {
    throw new Error('No patch endpoint for entity type "query"');
  }
  const raw = asRecord(
    await apiRequest(path, {
      method: 'PATCH',
      json: patch,
      contentType: 'application/json-patch+json',
    }),
  );
  const mapped = raw ? mapQuery(raw) : null;
  if (!mapped) {
    throw new Error('Patch query succeeded but the response had no query');
  }
  return mapped;
}

/**
 * Official updateQueryVote + refetch: PUT /v1/queries/{id}/vote answers a
 * ChangeEvent, not the entity, so the authoritative query is re-read with
 * the full field set, exactly as the pin does after a vote.
 */
export async function voteQuery(id: string, updatedVoteType: VoteType): Promise<DataQuery> {
  const path = resolveVotePath('query', id);
  if (!path) {
    throw new Error('No vote endpoint for entity type "query"');
  }
  await apiRequest(path, { method: 'PUT', json: { updatedVoteType } });
  return getQueryDetails(id);
}

/** Official deleteQuery: DELETE /v1/queries/{id}. */
export async function deleteQuery(id: string): Promise<void> {
  await apiRequest(`/v1/queries/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
