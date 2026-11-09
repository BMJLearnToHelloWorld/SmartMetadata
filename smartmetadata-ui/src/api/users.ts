/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { entityRefValue, setFieldPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import { asBoolean, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { AdminUser, CreateUserRequest, IncludeFilter, Paged } from '@/types/admin';
import { apiRequest } from './client';

export const USER_FIELDS = 'profile,roles,teams';

// P2 B5: personal access tokens (UserResource /security/token + /generateToken).
// Expiry values are the official JWTTokenExpiry enum members.
export const JWT_TOKEN_EXPIRY_OPTIONS = ['OneHour', '1', '7', '30', '60', '90', 'Unlimited'] as const;
export type JwtTokenExpiry = (typeof JWT_TOKEN_EXPIRY_OPTIONS)[number];

export interface PersonalAccessToken {
  token: string;
  tokenName?: string;
  tokenType?: string;
  expiryDate?: string;
  userId?: string;
}

export interface CreatedPersonalToken extends PersonalAccessToken {
  secret?: string;
}

function mapPersonalToken(raw: Record<string, unknown>): PersonalAccessToken | null {
  const token = asString(raw.token);
  if (!token) {
    return null;
  }
  return {
    token,
    tokenName: asString(raw.tokenName) || undefined,
    tokenType: asString(raw.tokenType) || undefined,
    expiryDate: asString(raw.expiryDate) || undefined,
    userId: asString(raw.userId) || undefined,
  };
}

function mapCreatedToken(payload: unknown): CreatedPersonalToken | null {
  const raw = asRecord(payload);
  if (!raw) {
    // The admin generate endpoint answers with the raw token string.
    return typeof payload === 'string' && payload ? { token: payload, secret: payload } : null;
  }
  const base = mapPersonalToken(raw);
  if (!base) {
    return null;
  }
  // The one-time secret arrives as jwtToken on create; the list items
  // never carry it, so a created token is the only place it is shown.
  const secret = asString(raw.jwtToken) || asString(raw.token) || undefined;
  return { ...base, secret };
}

/** Own tokens, or another user's when an admin passes username. */
export function listPersonalTokens(username?: string): Promise<Paged<PersonalAccessToken>> {
  return apiRequest<unknown>('/v1/users/security/token', {
    query: { username },
  }).then((payload) => parsePaged(payload, mapPersonalToken));
}

/** Create schema: tokenName + JWTTokenExpiry, both required. */
export function createPersonalToken(tokenName: string, JWTTokenExpiry: JwtTokenExpiry): Promise<CreatedPersonalToken | null> {
  return apiRequest<unknown>('/v1/users/security/token', {
    method: 'PUT',
    json: { tokenName, JWTTokenExpiry },
  }).then(mapCreatedToken);
}

/**
 * Per-token revoke passes tokenIds: [token.token] (official AccessTokenRow);
 * revoke-all passes removeAll=true, with username for an admin revoking
 * another user's tokens.
 */
export function revokePersonalTokens(
  tokenIds: string[],
  opts: { username?: string; removeAll?: boolean } = {},
): Promise<unknown> {
  return apiRequest<unknown>('/v1/users/security/token/revoke', {
    method: 'PUT',
    query: { username: opts.username, removeAll: opts.removeAll ? true : undefined },
    json: { tokenIds },
  });
}

/** Admin generate for a user or bot: PUT /v1/users/generateToken/{id}. */
export function generateUserToken(userId: string, JWTTokenExpiry: JwtTokenExpiry): Promise<CreatedPersonalToken | null> {
  return apiRequest<unknown>(`/v1/users/generateToken/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    json: { JWTTokenExpiry },
  }).then(mapCreatedToken);
}

export interface ListUsersQuery {
  limit?: number;
  after?: string;
  team?: string;
  isAdmin?: boolean;
  isBot?: boolean;
  include?: IncludeFilter;
  fields?: string;
}

function mapUser(raw: Record<string, unknown>): AdminUser | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    email: asString(raw.email) || undefined,
    description: asString(raw.description) || undefined,
    isAdmin: asBoolean(raw.isAdmin),
    isBot: asBoolean(raw.isBot),
    deleted: asBoolean(raw.deleted),
    lastLoginTime: typeof raw.lastLoginTime === 'number' ? raw.lastLoginTime : undefined,
    lastActivityTime: typeof raw.lastActivityTime === 'number' ? raw.lastActivityTime : undefined,
    teams: mapEntityRefs(raw.teams),
    roles: mapEntityRefs(raw.roles),
  };
}

/** Official OnlineUsers query: timeWindow in minutes, 0 means all time. */
export const ONLINE_USER_FIELDS = 'profile,teams,roles,lastLoginTime,lastActivityTime';

export interface ListOnlineUsersQuery {
  timeWindow?: number;
  limit?: number;
  after?: string;
  fields?: string;
}

/** Official `GET /v1/users/online` (OnlineUsersPage). A 404 here means the
 * backend has not implemented the endpoint yet; callers surface it as an
 * honest error, never as an empty "no online users" list. */
export function listOnlineUsers(query: ListOnlineUsersQuery = {}): Promise<Paged<AdminUser>> {
  return apiRequest<unknown>('/v1/users/online', {
    query: {
      timeWindow: query.timeWindow ?? 1440,
      fields: query.fields ?? ONLINE_USER_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapUser));
}

export function listUsers(query: ListUsersQuery = {}): Promise<Paged<AdminUser>> {
  return apiRequest<unknown>('/v1/users', {
    query: {
      fields: query.fields ?? USER_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
      team: query.team,
      isAdmin: query.isAdmin,
      isBot: query.isBot,
      include: query.include,
    },
  }).then((payload) => parsePaged(payload, mapUser));
}

export async function getUser(id: string, include: IncludeFilter = 'all'): Promise<AdminUser> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/users/${encodeURIComponent(id)}`, {
    query: { fields: USER_FIELDS, include },
  });
  const mapped = mapUser(raw);
  if (!mapped) {
    throw new Error('User response was missing id and name');
  }
  return mapped;
}

/**
 * Official getUserByName (rest/userAPI.ts): GET /users/name/{name}.
 * The assignee filter resolves a selected name to its display ref
 * through this, falling back to teams (getTeamByName) and then to a
 * bare {id: name, type: 'user'} ref — never through a list search.
 * ADR:2026-11-08-incident-assignee-aggregate-candidates
 */
export async function getUserByName(name: string): Promise<AdminUser> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/users/name/${encodeURIComponent(name)}`);
  const mapped = mapUser(raw);
  if (!mapped) {
    throw new Error('User response was missing id and name');
  }
  return mapped;
}

export async function createUser(body: CreateUserRequest): Promise<AdminUser> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/users', {
    method: 'POST',
    json: body,
  });
  const mapped = mapUser(raw);
  if (!mapped) {
    throw new Error('Create user succeeded but the response had no user');
  }
  return mapped;
}

export async function updateUser(body: CreateUserRequest): Promise<AdminUser> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/users', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapUser(raw);
  if (!mapped) {
    throw new Error('Update user succeeded but the response had no user');
  }
  return mapped;
}

export function deactivateUser(id: string): Promise<unknown> {
  return apiRequest(`/v1/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function restoreUser(id: string): Promise<unknown> {
  return apiRequest('/v1/users/restore', {
    method: 'PUT',
    json: { id },
  });
}

export function patchUser(id: string, patch: JsonPatchOp[]): Promise<unknown> {
  return apiRequest(`/v1/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}

export function assignUserRolesPatch(currentRoles: unknown, roleIds: string[]): JsonPatchOp[] {
  return setFieldPatch(
    '/roles',
    currentRoles,
    roleIds.map((id) => entityRefValue(id, 'role')),
  );
}

/**
 * R-16: the Admins tab used to search the user index without any admin
 * constraint, so search mode ignored the tab. Official UserListPageV1
 * passes queryFilter = getTermQuery({ isAdmin: String(isAdmin) }) to
 * the USER-index search (SearchPureUtils.getTermQuery wraps each term
 * as { term: { [field]: value } } under query.bool.must), and the
 * server search API accepts it as the query_filter param
 * (searchAPI.ts sends query_filter: JSON.stringify(queryFilter)).
 * The filter below is that exact shape, stringified — no server
 * parameter is added and no backend code changes.
 */
export function buildAdminUserQueryFilter(): string {
  return JSON.stringify({
    query: { bool: { must: [{ term: { isAdmin: 'true' } }] } },
  });
}

export async function searchUsers(
  query: string,
  from = 0,
  size = 25,
  queryFilter?: string,
): Promise<Paged<AdminUser>> {
  const q = query.trim().length > 0 ? query.trim() : '*';
  const payload = await apiRequest<unknown>('/v1/search/query', {
    query: {
      q,
      index: 'user',
      from,
      size,
      include_aggregations: false,
      query_filter: queryFilter,
    },
  });
  const root = asRecord(payload);
  const hitsNode = asRecord(root?.hits);
  const hits = Array.isArray(hitsNode?.hits) ? hitsNode.hits : [];
  const totalRaw = hitsNode?.total;
  const total =
    typeof totalRaw === 'number'
      ? totalRaw
      : asRecord(totalRaw) && typeof asRecord(totalRaw)?.value === 'number'
        ? (asRecord(totalRaw)?.value as number)
        : undefined;
  const data = hits.flatMap((item) => {
    const hit = asRecord(item);
    const source = asRecord(hit?._source) ?? {};
    return mapUser({
      id: asString(source.id) || asString(hit?._id),
      name: asString(source.name),
      displayName: asString(source.displayName),
      email: asString(source.email),
      description: asString(source.description),
      isAdmin: source.isAdmin,
      isBot: source.isBot,
      deleted: source.deleted,
      teams: source.teams,
      roles: source.roles,
    });
  });
  return { data, total };
}
