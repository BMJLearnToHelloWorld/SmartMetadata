/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { AdminRole, Paged } from '@/types/admin';
import { apiRequest } from './client';

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
    policies: mapEntityRefs(raw.policies),
    users: mapEntityRefs(raw.users),
    teams: mapEntityRefs(raw.teams),
  };
}

export function listRoles(limit = 100, after?: string): Promise<Paged<AdminRole>> {
  return apiRequest<unknown>('/v1/roles', {
    query: { fields: ROLE_FIELDS, limit, after },
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

export function searchRoles(query: string, limit = 25): Promise<Paged<AdminRole>> {
  return apiRequest<unknown>('/v1/roles/search', {
    query: { q: query, fields: ROLE_FIELDS, limit },
  }).then((payload) => parsePaged(payload, mapRole));
}

export interface CreateRoleRequest {
  name: string;
  displayName?: string;
  description?: string;
  policies?: string[];
}

/** Official CreateRole (rest/rolesAPIV1.ts): POST /v1/roles. */
export async function createRole(body: CreateRoleRequest): Promise<AdminRole> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/roles', {
    method: 'POST',
    json: {
      name: body.name,
      displayName: body.displayName,
      description: body.description,
      policies: (body.policies ?? []).map((id) => ({ id, type: 'policy' })),
    },
  });
  const mapped = mapRole(raw);
  if (!mapped) {
    throw new Error('Create role succeeded but the response had no role');
  }
  return mapped;
}
