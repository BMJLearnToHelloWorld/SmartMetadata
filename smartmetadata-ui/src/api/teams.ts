/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { entityRefValue, removeFieldPatch, setFieldPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import { asBoolean, asNumber, asRecord, asString, parsePaged } from '@/api/json';
import type { AdminTeam, CreateTeamRequest, IncludeFilter, Paged } from '@/types/admin';
import { apiRequest } from './client';
import { mapAdminEntityRef, mapAdminEntityRefs, mapAdminProfile } from './users';

export const TEAM_FIELDS = 'users,defaultRoles,parents,policies,userCount';
export const TEAM_TYPES = ['Group', 'Department', 'Division', 'BusinessUnit', 'Organization'] as const;

/**
 * Pin TeamsPage two-stage fetch field sets (TeamsPage.tsx:291-349).
 * Basic: userCount, parents, profile, owners, extension.
 * Advanced: users, userCount, defaultRoles, defaultPersona, policies,
 * childrenCount, descendantTeams, domains, extension.
 */
export const TEAM_DETAIL_FIELDS_BASIC = 'userCount,parents,profile,owners,extension';
export const TEAM_DETAIL_FIELDS_ADVANCED =
  'users,userCount,defaultRoles,defaultPersona,policies,childrenCount,descendantTeams,domains,extension';
/** Pin child-list advanced fetch (TeamsPage.tsx:161-213). */
export const TEAM_CHILD_FIELDS_ADVANCED = 'userCount,childrenCount,parents,defaultPersona';
/** PER-D9 Q7 hover-card field set, verbatim: parents,userCount. */
export const TEAM_POPOVER_FIELDS = 'parents,userCount';

export interface ListTeamsQuery {
  limit?: number;
  after?: string;
  before?: string;
  parentTeam?: string;
  include?: IncludeFilter;
  /**
   * Field set override. Pass '' to send no fields param (pin child-list
   * basic fetch). The default keeps the previous TEAM_FIELDS request
   * for existing callers.
   */
  fields?: string;
}

function mapTeam(raw: Record<string, unknown>): AdminTeam | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const extension = asRecord(raw.extension);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    teamType: asString(raw.teamType) || 'Group',
    isJoinable: asBoolean(raw.isJoinable),
    deleted: asBoolean(raw.deleted),
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    email: asString(raw.email) || undefined,
    userCount: asNumber(raw.userCount),
    childrenCount: asNumber(raw.childrenCount),
    profile: mapAdminProfile(raw.profile),
    owners: mapAdminEntityRefs(raw.owners),
    domains: mapAdminEntityRefs(raw.domains),
    defaultPersona: mapAdminEntityRef(raw.defaultPersona),
    descendantTeams: mapAdminEntityRefs(raw.descendantTeams),
    extension: extension ? { ...extension } : undefined,
    users: mapAdminEntityRefs(raw.users),
    defaultRoles: mapAdminEntityRefs(raw.defaultRoles),
    parents: mapAdminEntityRefs(raw.parents),
    policies: mapAdminEntityRefs(raw.policies),
  };
}

export function listTeams(query: ListTeamsQuery = {}): Promise<Paged<AdminTeam>> {
  const fields = query.fields === undefined ? TEAM_FIELDS : query.fields || undefined;
  return apiRequest<unknown>('/v1/teams', {
    query: {
      fields,
      limit: query.limit ?? 25,
      after: query.after,
      before: query.before,
      parentTeam: query.parentTeam,
      include: query.include,
    },
  }).then((payload) => parsePaged(payload, mapTeam));
}

export interface GetTeamByNameOptions {
  fields?: string[] | string;
  include?: IncludeFilter;
}

/**
 * Official getTeamByName (rest/teamsAPI.ts:55-64): GET /teams/name/{name}
 * with ListParams (fields/include). PER-D9 Q7 extends the signature
 * with the fields parameter; the throw-on-missing-id/name mapping
 * behaviour is retained. Callers that pass no options keep the
 * previous request shape (no fields/include params).
 */
export async function getTeamByName(name: string, options: GetTeamByNameOptions = {}): Promise<AdminTeam> {
  const fields = Array.isArray(options.fields) ? options.fields.join(',') : options.fields;
  const raw = await apiRequest<Record<string, unknown>>(`/v1/teams/name/${encodeURIComponent(name)}`, {
    query: { fields: fields || undefined, include: options.include },
  });
  const mapped = mapTeam(raw);
  if (!mapped) {
    throw new Error('Team response was missing id and name');
  }
  return mapped;
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

/** Official getTeamsHierarchy (rest/teamsAPI.ts:48-53): GET /teams/hierarchy. */
export async function getTeamsHierarchy(isJoinable = false): Promise<AdminTeam[]> {
  const payload = await apiRequest<unknown>('/v1/teams/hierarchy', {
    query: { isJoinable },
  });
  const root = asRecord(payload);
  const rows = Array.isArray(root?.data) ? root.data : [];
  return rows.flatMap((item) => {
    const rec = asRecord(item);
    const mapped = rec ? mapTeam(rec) : null;
    return mapped ? [mapped] : [];
  });
}

/**
 * Official create payload (pin TeamsPage.tsx:369-399): exactly 8 fields.
 * `parents` is constructed here from the parent team id — the form
 * never sends it (P3) — as `[parentTeamId]` when a parent is selected.
 * The form supplies the other 7 fields via CreateTeamRequest.
 */
export async function createTeam(body: CreateTeamRequest, parentTeamId?: string): Promise<AdminTeam> {
  const payload = {
    name: body.name,
    teamType: body.teamType,
    displayName: body.displayName,
    description: body.description,
    email: body.email || undefined,
    domains: body.domains,
    isJoinable: body.isJoinable,
    parents: parentTeamId ? [parentTeamId] : undefined,
  };
  const raw = await apiRequest<Record<string, unknown>>('/v1/teams', {
    method: 'POST',
    json: payload,
  });
  const mapped = mapTeam(raw);
  if (!mapped) {
    throw new Error('Create team succeeded but the response had no team');
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

export interface DeleteTeamOptions {
  hardDelete?: boolean;
  recursive?: boolean;
}

/** Official deleteEntity (rest/miscAPI.ts:169-183): DELETE with hardDelete + recursive. */
export function deleteTeam(id: string, options: DeleteTeamOptions = {}): Promise<unknown> {
  return apiRequest(`/v1/teams/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: {
      hardDelete: options.hardDelete,
      recursive: options.recursive,
    },
  });
}

/** Official restoreTeam (rest/teamsAPI.ts:101-108): PUT /teams/restore {id}. */
export function restoreTeam(id: string): Promise<unknown> {
  return apiRequest('/v1/teams/restore', {
    method: 'PUT',
    json: { id },
  });
}

export interface CsvExportJob {
  jobId: string;
}

function mapCsvExportJob(payload: unknown): CsvExportJob {
  const rec = asRecord(payload) ?? {};
  return { jobId: asString(rec.jobId) };
}

/** Official exportTeam (rest/teamsAPI.ts:110-117): GET .../exportAsync, {jobId}. */
export function exportTeam(teamName: string): Promise<CsvExportJob> {
  return apiRequest<unknown>(
    `/v1/teams/name/${encodeURIComponent(teamName)}/exportAsync`,
  ).then(mapCsvExportJob);
}

/** Official exportUserOfTeam (rest/teamsAPI.ts:118-127): GET /users/exportAsync?team=. */
export function exportUsersOfTeam(team: string): Promise<CsvExportJob> {
  return apiRequest<unknown>('/v1/users/exportAsync', {
    query: { team },
  }).then(mapCsvExportJob);
}

export interface CsvImportAsyncResponse {
  jobId: string;
  message: string;
}

function mapCsvImportAsyncResponse(payload: unknown): CsvImportAsyncResponse {
  const rec = asRecord(payload) ?? {};
  return { jobId: asString(rec.jobId), message: asString(rec.message) };
}

/**
 * Official importTeam (rest/teamsAPI.ts:129-145): PUT text/plain CSV,
 * dryRun param (default true). Returns the async job response.
 */
export function importTeam(teamName: string, data: string, dryRun = true): Promise<CsvImportAsyncResponse> {
  return apiRequest<unknown>(
    `/v1/teams/name/${encodeURIComponent(teamName)}/importAsync`,
    {
      method: 'PUT',
      query: { dryRun },
      text: data,
      contentType: 'text/plain',
    },
  ).then(mapCsvImportAsyncResponse);
}

/** Official importUserInTeam (rest/teamsAPI.ts:148-163): PUT /users/importAsync?team=&dryRun=. */
export function importUsersInTeam(team: string, data: string, dryRun = true): Promise<CsvImportAsyncResponse> {
  return apiRequest<unknown>('/v1/users/importAsync', {
    method: 'PUT',
    query: { team, dryRun },
    text: data,
    contentType: 'text/plain',
  }).then(mapCsvImportAsyncResponse);
}

/** Official getTeamsAssetCounts (rest/teamsAPI.ts:168-176): FQN -> count map. */
export async function getTeamsAssetCounts(): Promise<Record<string, number>> {
  const payload = await apiRequest<unknown>('/v1/teams/assets/counts');
  const rec = asRecord(payload) ?? {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(rec)) {
    if (typeof value === 'number') {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// PATCH builders (§6.4 whitelist extension). Each builder emits the ops
// for one field; callers combine them into a single PATCH. Empty op
// lists are still sent by the caller (A-group rule: the pin sends the
// compare result even when it is empty).
// ---------------------------------------------------------------------------

export function assignTeamDefaultRolesPatch(currentRoles: unknown, roleIds: string[]): JsonPatchOp[] {
  return setFieldPatch(
    '/defaultRoles',
    currentRoles,
    roleIds.map((id) => entityRefValue(id, 'role')),
  );
}

export function assignTeamPoliciesPatch(currentPolicies: unknown, policyIds: string[]): JsonPatchOp[] {
  return setFieldPatch(
    '/policies',
    currentPolicies,
    policyIds.map((id) => entityRefValue(id, 'policy')),
  );
}

export function assignTeamOwnersPatch(
  currentOwners: unknown,
  owners: Array<{ id: string; type: string }>,
): JsonPatchOp[] {
  return setFieldPatch(
    '/owners',
    currentOwners,
    owners.map((owner) => entityRefValue(owner.id, owner.type)),
  );
}

export function assignTeamDomainsPatch(currentDomains: unknown, domainIds: string[]): JsonPatchOp[] {
  // Team.domains is EntityReference[] (generated team.ts:72); only the
  // CREATE payload carries FQN strings (createTeam.ts:43). The PATCH
  // path sends minimal refs, like the other assign builders.
  return setFieldPatch(
    '/domains',
    currentDomains,
    domainIds.map((id) => entityRefValue(id, 'domain')),
  );
}

/** Default persona: clearing sends a remove op, setting sends the reference. */
export function assignTeamDefaultPersonaPatch(
  currentDefaultPersona: unknown,
  personaId?: string,
): JsonPatchOp[] {
  if (!personaId) {
    return currentDefaultPersona ? [removeFieldPatch('/defaultPersona')] : [];
  }
  return setFieldPatch('/defaultPersona', currentDefaultPersona, entityRefValue(personaId, 'persona'));
}

/**
 * Email save (pin TeamsInfo): the pin compares the whole team object,
 * so an emptied email becomes undefined and emits a remove op. The
 * builder reproduces that: empty next value removes the field.
 */
export function setTeamEmailPatch(currentEmail: unknown, nextEmail: string): JsonPatchOp[] {
  const trimmed = nextEmail.trim();
  if (!trimmed) {
    return currentEmail ? [removeFieldPatch('/email')] : [];
  }
  return setFieldPatch('/email', currentEmail, trimmed);
}

/**
 * Drag-move save (pin TeamHierarchy:164-224): parents becomes the
 * single drop-target reference, or is removed for a root drop. The
 * pin compares the full team fetched with fields [users, defaultRoles,
 * policies, owners, parents, children]; the parents op is the only
 * one that differs, so the builder emits exactly that op.
 */
export function assignTeamParentsPatch(currentParents: unknown, dropTeamId?: string): JsonPatchOp[] {
  if (!dropTeamId) {
    return currentParents ? [removeFieldPatch('/parents')] : [];
  }
  return setFieldPatch('/parents', currentParents, [entityRefValue(dropTeamId, 'team')]);
}

/**
 * Subscription save (pin TeamsSubscription): the profile.subscription
 * object is a single-key object {[webhook]: {endpoint}}; choosing
 * None removes the subscription. When no profile exists yet, the
 * whole profile object is added (JSON Patch add needs the parent).
 */
export function setTeamSubscriptionPatch(
  currentProfile: { subscription?: unknown } | undefined,
  webhook?: string,
  endpoint?: string,
): JsonPatchOp[] {
  const subscription = currentProfile?.subscription;
  if (!webhook) {
    return subscription ? [removeFieldPatch('/profile/subscription')] : [];
  }
  const next = { [webhook]: { endpoint } };
  if (!currentProfile) {
    return [{ op: 'add', path: '/profile', value: { subscription: next } }];
  }
  return setFieldPatch('/profile/subscription', subscription, next);
}

// ---------------------------------------------------------------------------
// Search (pin TeamDetailsV1 team search + UserTab member search).
// ---------------------------------------------------------------------------

/**
 * Child-team search filter (pin TeamDetailsV1.tsx:341-391): must match
 * the parent id, must_not match the Organization name keyword.
 */
export function buildTeamChildSearchFilter(teamId: string): string {
  return JSON.stringify({
    query: {
      bool: {
        must: [{ term: { 'parents.id': teamId } }],
        must_not: [{ term: { 'name.keyword': 'Organization' } }],
      },
    },
  });
}

/**
 * Team-member search filter (pin UserTab): a single `terms` clause on
 * teams.id covering the team plus its descendant teams. No isBot term.
 */
export function buildTeamMembersSearchFilter(teamIds: string[]): string {
  return JSON.stringify({
    query: { bool: { must: [{ terms: { 'teams.id': teamIds } } ] } },
  });
}

export interface SearchTeamsOptions {
  includeDeleted?: boolean;
}

/** Team-index search; empty `children` arrays are stripped from results (pin). */
export async function searchTeams(
  query: string,
  from = 0,
  size = 10,
  queryFilter?: string,
  options: SearchTeamsOptions = {},
): Promise<Paged<AdminTeam>> {
  const q = query.trim().length > 0 ? query.trim() : '*';
  const payload = await apiRequest<unknown>('/v1/search/query', {
    query: {
      q,
      index: 'team',
      from,
      size,
      include_aggregations: false,
      query_filter: queryFilter,
      deleted: options.includeDeleted === true ? true : undefined,
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
    const mapped = mapTeam({
      id: asString(source.id) || asString(hit?._id),
      name: asString(source.name),
      displayName: asString(source.displayName),
      description: asString(source.description),
      teamType: source.teamType,
      isJoinable: source.isJoinable,
      deleted: source.deleted,
      fullyQualifiedName: source.fullyQualifiedName,
      userCount: source.userCount,
      childrenCount: source.childrenCount,
      parents: source.parents,
      users: source.users,
      defaultRoles: source.defaultRoles,
      policies: source.policies,
    });
    return mapped ? [mapped] : [];
  });
  return { data, total };
}
