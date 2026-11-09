/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RestClient } from './client.js';
import { clampInt } from './limits.js';

/**
 * `get_user_context`: who the caller is, what they own, what they follow.
 *
 * Ownership and following are search-index facts, so the summaries read
 * GET /v1/search/query with a `query_filter` the caller cannot see past:
 * the server applies its own access filter on top, and the summaries only
 * ever expose the FQN, name and updatedAt of the returned page.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */

export const USER_CONTEXT_LIMIT_DEFAULT = 20;
export const USER_CONTEXT_LIMIT_MIN = 1;
export const USER_CONTEXT_LIMIT_MAX = 100;

/** Entity types a gap filter can report on. */
export const GAP_ENTITY_TYPES = [
  'table',
  'dashboard',
  'topic',
  'mlmodel',
  'container',
  'apiEndpoint',
  'searchIndex',
  'databaseSchema',
  'database',
  'pipeline',
  'glossaryTerm',
] as const;

export const OWNED_FILTER_VALUES = ['NONE', 'MISSING_DESCRIPTION', 'MISSING_TIER', 'ANY_GAP'] as const;
export type OwnedFilter = (typeof OWNED_FILTER_VALUES)[number];

/**
 * A parameter that is only "true" or "false" (case-insensitive) parses;
 * anything else keeps the default. Coercing "yes" or "1" to false would
 * silently flip the caller's intent.
 */
export function boolParam(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (lowered === 'true') {
      return true;
    }
    if (lowered === 'false') {
      return false;
    }
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

export function limitParam(value: unknown): number {
  return clampInt(
    typeof value === 'number' ? value : undefined,
    USER_CONTEXT_LIMIT_MIN,
    USER_CONTEXT_LIMIT_MAX,
    USER_CONTEXT_LIMIT_DEFAULT,
  );
}

/**
 * An unrecognized `ownedFilter` does not fail the call: it falls back to
 * NONE and says so in `warnings`, because the caller asked for a summary,
 * not a filter definition. A blank value is simply NONE.
 */
export function resolveOwnedFilter(
  raw: string | undefined,
): { filter: OwnedFilter; warnings?: string[] } {
  if (raw === undefined || raw.trim() === '') {
    return { filter: 'NONE' };
  }
  const upper = raw.trim().toUpperCase();
  if ((OWNED_FILTER_VALUES as readonly string[]).includes(upper)) {
    return { filter: upper as OwnedFilter };
  }
  return {
    filter: 'NONE',
    warnings: [
      `Unrecognized ownedFilter '${raw}'; returned all owned entities without gap filtering. ` +
        'Valid values: NONE, MISSING_DESCRIPTION, MISSING_TIER, ANY_GAP.',
    ],
  };
}

function gapClauses(filter: OwnedFilter): Array<Record<string, unknown>> {
  if (filter === 'NONE') {
    return [];
  }
  const missingDescription = { bool: { must_not: [{ term: { descriptionStatus: 'COMPLETE' } }] } };
  const missingTier = { bool: { must_not: [{ exists: { field: 'tier.tagFQN' } }] } };
  if (filter === 'MISSING_DESCRIPTION') {
    return [missingDescription];
  }
  if (filter === 'MISSING_TIER') {
    return [missingTier];
  }
  return [
    { bool: { should: [missingDescription, missingTier], minimum_should_match: 1 } },
  ];
}

export function ownedQueryFilter(
  ownerIds: string[],
  filter: OwnedFilter,
): Record<string, unknown> {
  return {
    query: {
      bool: {
        must: [
          {
            nested: {
              path: 'owners',
              query: { terms: { 'owners.id': ownerIds } },
              ignore_unmapped: true,
            },
          },
          { terms: { entityType: [...GAP_ENTITY_TYPES] } },
          ...gapClauses(filter),
        ],
      },
    },
  };
}

export function followedQueryFilter(userId: string): Record<string, unknown> {
  return { query: { bool: { must: [{ terms: { followers: [userId] } }] } } };
}

interface SearchHit {
  _source?: Record<string, unknown>;
}

interface SearchQueryResponse {
  hits?: { hits?: SearchHit[]; total?: { value?: number } };
}

export interface OwnedSummary {
  totalCount: number;
  byType: Record<string, number>;
  byTypeComplete?: boolean;
  recent: Array<Record<string, unknown>>;
}

export interface FollowedSummary {
  totalCount: number;
  entities: Array<Record<string, unknown>>;
}

/** The one-line summary of a hit; hits without type or FQN are dropped. */
export function summarizeHit(hit: SearchHit): Record<string, unknown> | null {
  const source = hit._source ?? {};
  const type = source.entityType;
  const fqn = source.fullyQualifiedName;
  if (typeof type !== 'string' || typeof fqn !== 'string') {
    return null;
  }
  const summary: Record<string, unknown> = {
    type,
    fqn,
    name: typeof source.name === 'string' ? source.name : fqn,
  };
  if (typeof source.displayName === 'string') {
    summary.displayName = source.displayName;
  }
  if (typeof source.updatedAt === 'number') {
    summary.updatedAt = source.updatedAt;
  }
  return summary;
}

async function searchQuery(
  client: RestClient,
  queryFilter: Record<string, unknown>,
  size: number,
): Promise<SearchQueryResponse> {
  return client.request<SearchQueryResponse>('/v1/search/query', {
    query: {
      q: '*',
      index: 'all',
      size,
      from: 0,
      sort_field: 'updatedAt',
      sort_order: 'desc',
      track_total_hits: true,
      fetch_source: true,
      include_aggregations: false,
      query_filter: JSON.stringify(queryFilter),
    },
  });
}

export async function summarizeOwned(
  client: RestClient,
  ownerIds: string[],
  filter: OwnedFilter,
  limit: number,
): Promise<OwnedSummary> {
  if (ownerIds.length === 0) {
    return { totalCount: 0, byType: {}, recent: [] };
  }
  const response = await searchQuery(client, ownedQueryFilter(ownerIds, filter), limit);
  const hits = response.hits?.hits ?? [];
  const total = response.hits?.total?.value ?? 0;
  const byType: Record<string, number> = {};
  const recent: Array<Record<string, unknown>> = [];
  for (const hit of hits) {
    const summary = summarizeHit(hit);
    if (!summary) {
      continue;
    }
    byType[String(summary.type)] = (byType[String(summary.type)] ?? 0) + 1;
    recent.push(summary);
  }
  // byTypeComplete says whether the returned page covered the whole tally:
  // true only when the raw hit count equals the total. A partial page's
  // byType is a sample, not the full picture, and must read as one.
  const rawHitCount = hits.length;
  return {
    totalCount: total,
    byType,
    byTypeComplete: rawHitCount === total,
    recent,
  };
}

export async function summarizeFollowed(
  client: RestClient,
  userId: string,
  limit: number,
): Promise<FollowedSummary> {
  const response = await searchQuery(client, followedQueryFilter(userId), limit);
  const hits = response.hits?.hits ?? [];
  const total = response.hits?.total?.value ?? 0;
  const entities: Array<Record<string, unknown>> = [];
  for (const hit of hits) {
    const summary = summarizeHit(hit);
    if (summary) {
      entities.push(summary);
    }
  }
  return { totalCount: total, entities };
}

export interface UserIdentity {
  id: string;
  name: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
  isBot: boolean;
}

export function identityOf(user: Record<string, unknown>): UserIdentity {
  return {
    id: String(user.id ?? ''),
    name: String(user.name ?? ''),
    ...(typeof user.displayName === 'string' ? { displayName: user.displayName } : {}),
    ...(typeof user.email === 'string' ? { email: user.email } : {}),
    isAdmin: user.isAdmin === true,
    isBot: user.isBot === true,
  };
}

function slimRefList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: item.id,
      name: item.name,
      ...(typeof item.displayName === 'string' ? { displayName: item.displayName } : {}),
    }));
}

function slimDomains(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({ name: item.name, fqn: item.fullyQualifiedName }));
}

export async function fetchUserContext(
  client: RestClient,
  args: {
    includeOwnedSummary: boolean;
    includeFollowedSummary: boolean;
    ownedLimit: number;
    followedLimit: number;
    ownedFilter: string | undefined;
  },
): Promise<Record<string, unknown>> {
  const user = await client.request<Record<string, unknown>>('/v1/users/loggedInUser');
  const identity = identityOf(user);
  const result: Record<string, unknown> = { user: identity };

  const teamIds = slimRefList(user.teams).map((team) => String(team.id));
  const ownerIds = [identity.id, ...teamIds];
  const resolvedFilter = resolveOwnedFilter(args.ownedFilter);
  if (resolvedFilter.warnings) {
    result.warnings = resolvedFilter.warnings;
  }
  if (args.includeOwnedSummary) {
    result.ownedSummary = await summarizeOwned(
      client,
      ownerIds,
      resolvedFilter.filter,
      args.ownedLimit,
    );
  }
  if (args.includeFollowedSummary) {
    result.followedSummary = await summarizeFollowed(client, identity.id, args.followedLimit);
  }
  result.teams = slimRefList(user.teams);
  result.roles = slimRefList(user.roles);
  result.inheritedRoles = slimRefList(user.inheritedRoles);
  result.domains = slimDomains(user.domains);
  const persona = user.persona;
  if (persona && typeof persona === 'object') {
    const personaRecord = persona as Record<string, unknown>;
    result.persona = {
      name: personaRecord.name,
      ...(typeof personaRecord.displayName === 'string'
        ? { displayName: personaRecord.displayName }
        : {}),
    };
  }
  return result;
}
