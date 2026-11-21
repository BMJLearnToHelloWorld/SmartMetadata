/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { asBoolean, asString, parsePaged } from '@/api/json';
import type { AdminRole, Paged } from '@/types/admin';
import { apiRequest } from './client';
import { deleteEntity } from './entityDelete';
import { mapAdminEntityRefs } from './users';

export const ROLE_FIELDS = 'policies,teams,users';

function mapRole(raw: Record<string, unknown>): AdminRole | null {
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
    // 03 §2.1: the entity FQN is carried verbatim, never derived from name.
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    policies: mapAdminEntityRefs(raw.policies),
    users: mapAdminEntityRefs(raw.users),
    teams: mapAdminEntityRefs(raw.teams),
  };
}

/**
 * Pin getRoles (rest/rolesAPIV1.ts:30-50): GET /roles with an explicit
 * `fields` string, `default` flag and limit. The `defaultRoles` flag
 * defaults to undefined (not sent); AddAttributeModal passes `false`
 * to match pin `getRoles('', …, false, 100)`.
 */
export function listRoles(
  limit = 100,
  after?: string,
  fields: string = ROLE_FIELDS,
  defaultRoles?: boolean,
): Promise<Paged<AdminRole>> {
  return apiRequest<unknown>('/v1/roles', {
    query: { fields, limit, after, default: defaultRoles },
  }).then((payload) => parsePaged(payload, mapRole));
}

export async function getRole(id: string): Promise<AdminRole> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/roles/${encodeURIComponent(id)}`, {
    query: { fields: ROLE_FIELDS },
  });
  const mapped = mapRole(raw);
  if (!mapped) {
    throw new Error('Role response was missing id and name');
  }
  return mapped;
}

/** Official getRoleByName (rest/rolesAPIV1.ts:97-106): GET /roles/name/{fqn}?fields=. */
export async function getRoleByName(fqn: string, fields: string): Promise<AdminRole> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/roles/name/${encodeURIComponent(fqn)}`, {
    query: { fields },
  });
  const mapped = mapRole(raw);
  if (!mapped) {
    throw new Error('Role response was missing id and name');
  }
  return mapped;
}

/**
 * Retained: still consumed by the bot detail role search. CSV 03:#2
 * deletes this helper only when it has no other callers; the Roles
 * list no longer uses it (03 §3.4), but the bot surface does, so the
 * function stays and only the list search UI was removed.
 */
export function searchRoles(query: string, limit = 25): Promise<Paged<AdminRole>> {
  return apiRequest<unknown>('/v1/roles/search', {
    query: { q: query, fields: ROLE_FIELDS, limit },
  }).then((payload) => parsePaged(payload, mapRole));
}

/** Official patchRole (rest/rolesAPIV1.ts:137-145), same shape as patchPolicy. */
export async function patchRole(id: string, patch: JsonPatchOp[]): Promise<AdminRole> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/roles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  const mapped = mapRole(raw);
  if (!mapped) {
    throw new Error('Patch role succeeded but the response had no role');
  }
  return mapped;
}

/** Wire-level delete through the shared helper (03 §2.2); views use hardDeleteEntity for the toast + boolean contract. */
export function deleteRole(id: string, recursive = false): Promise<unknown> {
  return deleteEntity('role', id, recursive);
}

/**
 * Official CreateRole (api/teams/createRole.json, U6): `policies` is a
 * required array of entity-name (FQN) strings. The form collects no
 * displayName, so the request carries none.
 */
export interface CreateRoleRequest {
  name: string;
  description?: string;
  policies: string[];
}

/** Official addRole (rest/rolesAPIV1.ts:119-126): POST /v1/roles. FQN strings go out verbatim. */
export async function createRole(body: CreateRoleRequest): Promise<AdminRole> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/roles', {
    method: 'POST',
    json: {
      name: body.name,
      description: body.description,
      policies: body.policies,
    },
  });
  const mapped = mapRole(raw);
  if (!mapped) {
    throw new Error('Create role succeeded but the response had no role');
  }
  return mapped;
}
