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

export async function searchUsers(query: string, from = 0, size = 25): Promise<Paged<AdminUser>> {
  const q = query.trim().length > 0 ? query.trim() : '*';
  const payload = await apiRequest<unknown>('/v1/search/query', {
    query: {
      q,
      index: 'user',
      from,
      size,
      include_aggregations: false,
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
