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
import { asBoolean, asNumber, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { AdminTeam, CreateTeamRequest, IncludeFilter, Paged } from '@/types/admin';
import { apiRequest } from './client';

export const TEAM_FIELDS = 'users,defaultRoles,parents,policies,userCount';
export const TEAM_TYPES = ['Group', 'Department', 'Division', 'BusinessUnit', 'Organization'] as const;

export interface ListTeamsQuery {
  limit?: number;
  after?: string;
  parentTeam?: string;
  include?: IncludeFilter;
}

function mapTeam(raw: Record<string, unknown>): AdminTeam | null {
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
    teamType: asString(raw.teamType) || 'Group',
    isJoinable: asBoolean(raw.isJoinable),
    deleted: asBoolean(raw.deleted),
    userCount: asNumber(raw.userCount),
    users: mapEntityRefs(raw.users),
    defaultRoles: mapEntityRefs(raw.defaultRoles),
    parents: mapEntityRefs(raw.parents),
    policies: mapEntityRefs(raw.policies),
  };
}

export function listTeams(query: ListTeamsQuery = {}): Promise<Paged<AdminTeam>> {
  return apiRequest<unknown>('/v1/teams', {
    query: {
      fields: TEAM_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
      parentTeam: query.parentTeam,
      include: query.include,
    },
  }).then((payload) => parsePaged(payload, mapTeam));
}

export async function getTeam(id: string, include: IncludeFilter = 'all'): Promise<AdminTeam> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/teams/${encodeURIComponent(id)}`, {
    query: { fields: TEAM_FIELDS, include },
  });
  const mapped = mapTeam(raw);
  if (!mapped) {
    throw new Error('Team response was missing id and name');
  }
  return mapped;
}

export async function createTeam(body: CreateTeamRequest): Promise<AdminTeam> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/teams', {
    method: 'POST',
    json: body,
  });
  const mapped = mapTeam(raw);
  if (!mapped) {
    throw new Error('Create team succeeded but the response had no team');
  }
  return mapped;
}

export async function updateTeam(body: CreateTeamRequest): Promise<AdminTeam> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/teams', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapTeam(raw);
  if (!mapped) {
    throw new Error('Update team succeeded but the response had no team');
  }
  return mapped;
}

/** Replaces the team's direct members. Only Group teams hold users. */
export function replaceTeamUsers(teamId: string, userIds: string[]): Promise<unknown> {
  return apiRequest(`/v1/teams/${encodeURIComponent(teamId)}/users`, {
    method: 'PUT',
    json: userIds.map((id) => entityRefValue(id, 'user')),
  });
}

export function removeTeamUser(teamId: string, userId: string): Promise<unknown> {
  return apiRequest(
    `/v1/teams/${encodeURIComponent(teamId)}/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export function patchTeam(id: string, patch: JsonPatchOp[]): Promise<unknown> {
  return apiRequest(`/v1/teams/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}

export function assignTeamDefaultRolesPatch(currentRoles: unknown, roleIds: string[]): JsonPatchOp[] {
  return setFieldPatch(
    '/defaultRoles',
    currentRoles,
    roleIds.map((id) => entityRefValue(id, 'role')),
  );
}
