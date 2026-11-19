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
import type {
  AdminEntityRef,
  AdminProfile,
  AdminUser,
  CreateUserRequest,
  IncludeFilter,
  JwtTokenExpiry,
  Paged,
} from '@/types/admin';
import type { EntityRef } from '@/types/api';
import { apiRequest } from './client';

export const USER_FIELDS = 'profile,roles,teams';

/**
 * Official user-detail field set (pin pages/UserPage/UserPage.component.tsx:48-61):
 * profile, roles, teams, personas, lastActivityTime, lastLoginTime,
 * defaultPersona, domains, extension.
 */
export const USER_DETAIL_FIELDS =
  'profile,roles,teams,personas,lastActivityTime,lastLoginTime,defaultPersona,domains,extension';

/**
 * PER-D9 Q7 hover-card field set, verbatim: teams,roles,profile.
 * Pin: preconditions/05-per-d9-contract.md §9 item 7.
 */
export const USER_POPOVER_FIELDS = 'teams,roles,profile';

/**
 * Reference mapping that keeps `deleted` and `description`, which the
 * base `mapEntityRefs` drops. Members surfaces read both on reference
 * arrays (deleted-team filtering, RolesAndPoliciesList description
 * column). Shared with api/teams.ts; there is no import cycle because
 * this module imports neither teams.ts nor any view.
 */
export function mapAdminEntityRefs(value: unknown): AdminEntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.name) || asString(rec.displayName) || asString(rec.fullyQualifiedName);
    const id = asString(rec.id);
    if (!name && !id) {
      return [];
    }
    return [
      {
        id: id || undefined,
        name: name || id,
        displayName: asString(rec.displayName) || undefined,
        type: asString(rec.type) || undefined,
        fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
        deleted: asBoolean(rec.deleted),
        description: asString(rec.description) || undefined,
      },
    ];
  });
}

export function mapAdminEntityRef(value: unknown): AdminEntityRef | undefined {
  return mapAdminEntityRefs([value])[0];
}

export function mapAdminProfile(value: unknown): AdminProfile | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const images = asRecord(rec.images);
  const subscription = asRecord(rec.subscription);
  const mappedSubscription: Record<string, { endpoint?: string } | undefined> | undefined =
    subscription
      ? Object.fromEntries(
          Object.entries(subscription).map(([key, entry]) => {
            const entryRec = asRecord(entry);
            return [key, entryRec ? { endpoint: asString(entryRec.endpoint) || undefined } : undefined];
          }),
        )
      : undefined;
  if (!images && !subscription) {
    return {};
  }
  return {
    images: images
      ? {
          image: asString(images.image) || undefined,
          image24: asString(images.image24) || undefined,
          image32: asString(images.image32) || undefined,
          image48: asString(images.image48) || undefined,
          image72: asString(images.image72) || undefined,
          image192: asString(images.image192) || undefined,
          image512: asString(images.image512) || undefined,
        }
      : undefined,
    subscription: mappedSubscription,
  };
}

export interface ListUsersQuery {
  limit?: number;
  after?: string;
  before?: string;
  team?: string;
  isAdmin?: boolean;
  isBot?: boolean;
  include?: IncludeFilter;
  fields?: string;
}

export function mapUser(raw: Record<string, unknown>): AdminUser | null {
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
    email: asString(raw.email) || undefined,
    description: asString(raw.description) || undefined,
    isAdmin: asBoolean(raw.isAdmin),
    isBot: asBoolean(raw.isBot),
    deleted: asBoolean(raw.deleted),
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    allowImpersonation: asBoolean(raw.allowImpersonation),
    profile: mapAdminProfile(raw.profile),
    personas: mapAdminEntityRefs(raw.personas),
    inheritedRoles: mapAdminEntityRefs(raw.inheritedRoles),
    inheritedPersonas: mapAdminEntityRefs(raw.inheritedPersonas),
    domains: mapAdminEntityRefs(raw.domains),
    defaultPersona: mapAdminEntityRef(raw.defaultPersona),
    extension: extension ? { ...extension } : undefined,
    lastLoginTime: typeof raw.lastLoginTime === 'number' ? raw.lastLoginTime : undefined,
    lastActivityTime: typeof raw.lastActivityTime === 'number' ? raw.lastActivityTime : undefined,
    teams: mapAdminEntityRefs(raw.teams),
    roles: mapAdminEntityRefs(raw.roles),
    follows: mapAdminEntityRefs(raw.follows),
  };
}

/** Official OnlineUsers query: timeWindow in minutes, 0 means all time. */
export async function getUserFollows(id: string): Promise<EntityRef[]> {
  // ADR:2026-11-08-context-center-bookmarks-follows — official
  // BookMarkWidget reads getUserById(id, {fields: 'follows'}) and keeps
  // the entries whose type is 'page' (EntityType.KNOWLEDGE_PAGE). No
  // separate bookmark endpoint exists.
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/users/${encodeURIComponent(id)}`,
    { query: { fields: 'follows' } },
  );
  const user = mapUser(raw);
  return (user?.follows ?? []).filter((ref) => ref.type === 'page');
}
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
      before: query.before,
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

export interface GetUserByIdOptions {
  fields?: string[] | string;
  include?: IncludeFilter;
}

/**
 * Official getUserById (rest/userAPI.ts:86-90): GET /users/{id} with
 * caller-chosen ListParams (fields/include). Unlike `getUser` above,
 * which pins USER_FIELDS, this mirrors pin's free-form params: the
 * persona detail page reads `fields: [personas, defaultPersona]` with
 * `include: all`, and the users tab reads `fields: [teams, roles]`
 * with no include. The throw-on-missing-id/name mapping behaviour
 * matches `getUser`.
 */
export async function getUserById(id: string, options: GetUserByIdOptions = {}): Promise<AdminUser> {
  const fields = Array.isArray(options.fields) ? options.fields.join(',') : options.fields;
  const raw = await apiRequest<Record<string, unknown>>(`/v1/users/${encodeURIComponent(id)}`, {
    query: { fields: fields || undefined, include: options.include },
  });
  const mapped = mapUser(raw);
  if (!mapped) {
    throw new Error('User response was missing id and name');
  }
  return mapped;
}

export interface GetUserByNameOptions {
  fields?: string[] | string;
  include?: IncludeFilter;
}

/**
 * Official getUserByName (rest/userAPI.ts:77-85): GET /users/name/{name}
 * with ListParams (fields/include). PER-D9 Q7 extends the signature
 * with the fields parameter; the throw-on-missing-id/name mapping
 * behaviour is retained. Callers that pass no options keep the
 * previous request shape (no fields/include params).
 * The assignee filter resolves a selected name to its display ref
 * through this, falling back to teams (getTeamByName) and then to a
 * bare {id: name, type: 'user'} ref — never through a list search.
 * ADR:2026-11-08-incident-assignee-aggregate-candidates
 */
export async function getUserByName(name: string, options: GetUserByNameOptions = {}): Promise<AdminUser> {
  const fields = Array.isArray(options.fields) ? options.fields.join(',') : options.fields;
  const raw = await apiRequest<Record<string, unknown>>(`/v1/users/name/${encodeURIComponent(name)}`, {
    query: { fields: fields || undefined, include: options.include },
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

/** Official createUserWithPut (rest/userAPI.ts:194-201): PUT /users, bot branch. */
export async function createUserWithPut(body: CreateUserRequest): Promise<AdminUser> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/users', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapUser(raw);
  if (!mapped) {
    throw new Error('Create user succeeded but the response had no user');
  }
  return mapped;
}

export interface DeactivateUserOptions {
  hardDelete?: boolean;
  recursive?: boolean;
}

/**
 * Official deleteEntity (rest/miscAPI.ts:169-183): DELETE /{type}/{id}
 * with hardDelete + recursive params. The previous no-param call is
 * preserved when no options are passed (other callers rely on it);
 * Members delete flows pass explicit options per the pin modal choice.
 */
export function deactivateUser(id: string, options: DeactivateUserOptions = {}): Promise<unknown> {
  return apiRequest(`/v1/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: {
      hardDelete: options.hardDelete,
      recursive: options.recursive,
    },
  });
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

/**
 * PATCH /v1/users/{id} with a JSON Patch, returning the mapped entity
 * (draft 10 §7.1: user PATCH returns the mapped entity). Folds the
 * transitional `updateBotUserDetail` from api/bots.ts; the request
 * contract is identical to patchUser.
 */
export async function updateUserDetail(id: string, patch: JsonPatchOp[]): Promise<AdminUser> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  const mapped = mapUser(raw);
  if (!mapped) {
    throw new Error('User update response was missing id and name');
  }
  return mapped;
}

export function assignUserRolesPatch(currentRoles: unknown, roleIds: string[]): JsonPatchOp[] {
  return setFieldPatch(
    '/roles',
    currentRoles,
    roleIds.map((id) => entityRefValue(id, 'role')),
  );
}

export function assignUserTeamsPatch(currentTeams: unknown, teamIds: string[]): JsonPatchOp[] {
  return setFieldPatch(
    '/teams',
    currentTeams,
    teamIds.map((id) => entityRefValue(id, 'team')),
  );
}

/**
 * Roles-card save (pin UsersProfile + UserPage.updateUserDetails): the
 * roles PATCH carries `isAdmin` in the same operation set — the Admin
 * pseudo-option is filtered out of the roles array and folded into
 * `isAdmin` (see views/admin/userLogic.ts buildRolesSave).
 */
export function assignUserRolesWithAdminPatch(
  currentRoles: unknown,
  currentIsAdmin: unknown,
  roleIds: string[],
  isAdmin: boolean,
): JsonPatchOp[] {
  return [
    ...assignUserRolesPatch(currentRoles, roleIds),
    ...setFieldPatch('/isAdmin', currentIsAdmin, isAdmin),
  ];
}

export function assignUserPersonasPatch(currentPersonas: unknown, personaIds: string[]): JsonPatchOp[] {
  return setFieldPatch(
    '/personas',
    currentPersonas,
    personaIds.map((id) => entityRefValue(id, 'persona')),
  );
}

/**
 * Default-persona save: clearing sends a remove op, setting sends the
 * single reference (pin UserPage.updateUserDetails deletes the key
 * when the new value is undefined).
 */
export function assignUserDefaultPersonaPatch(
  currentDefaultPersona: unknown,
  personaId?: string,
): JsonPatchOp[] {
  if (!personaId) {
    return currentDefaultPersona ? [removeFieldPatch('/defaultPersona')] : [];
  }
  return setFieldPatch('/defaultPersona', currentDefaultPersona, entityRefValue(personaId, 'persona'));
}

export function assignUserDomainsPatch(currentDomains: unknown, domainIds: string[]): JsonPatchOp[] {
  return setFieldPatch(
    '/domains',
    currentDomains,
    domainIds.map((id) => entityRefValue(id, 'domain')),
  );
}

/**
 * User-list search filter (pin UserListPageV1:149-195 + SearchPureUtils
 * getTermQuery): the list and the search always carry `isBot: 'false'`
 * explicitly, plus the isAdmin term for the Admins tab. The previous
 * admins-only builder dropped the isBot term; P4 restores it.
 */
export function buildUserSearchQueryFilter(isAdmin: boolean): string {
  return JSON.stringify({
    query: {
      bool: {
        must: [
          { term: { isAdmin: String(isAdmin) } },
          { term: { isBot: 'false' } },
        ],
      },
    },
  });
}

export function buildAdminUserQueryFilter(): string {
  return buildUserSearchQueryFilter(true);
}

/** Online Users search filter (pin OnlineUsersPage): isBot 'false' only. */
export function buildOnlineUserSearchQueryFilter(): string {
  return JSON.stringify({
    query: { bool: { must: [{ term: { isBot: 'false' } }] } },
  });
}

export interface SearchUsersOptions {
  includeDeleted?: boolean;
}

export async function searchUsers(
  query: string,
  from = 0,
  size = 25,
  queryFilter?: string,
  options: SearchUsersOptions = {},
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
    const mapped = mapUser({
      id: asString(source.id) || asString(hit?._id),
      name: asString(source.name),
      displayName: asString(source.displayName),
      email: asString(source.email),
      description: asString(source.description),
      isAdmin: source.isAdmin,
      isBot: source.isBot,
      deleted: source.deleted,
      lastLoginTime: source.lastLoginTime,
      lastActivityTime: source.lastActivityTime,
      teams: source.teams,
      roles: source.roles,
    });
    return mapped ? [mapped] : [];
  });
  return { data, total };
}

// ---------------------------------------------------------------------------
// Single JWT card (pin AccessTokenCard / AuthMechanism). P6 deletes the
// former four self-made helpers (list/create/revoke-all/generate token
// list); the /security/token backend endpoints are untouched.
// ---------------------------------------------------------------------------

/** Official PersonalAccessToken (generated/auth/personalAccessToken.ts). */
export interface UserAuthMechanism {
  jwtToken?: string;
  expiryDate?: number;
  tokenName?: string;
  tokenType?: string;
}

/** Official USER_DEFAULT_AUTHENTICATION_MECHANISM (AccessTokenCard). */
export const USER_DEFAULT_AUTHENTICATION_MECHANISM: UserAuthMechanism = {
  tokenType: 'PersonalAccessToken',
};

function mapAuthMechanism(raw: Record<string, unknown>): UserAuthMechanism | null {
  const jwtToken = asString(raw.jwtToken) || asString(raw.token) || undefined;
  const expiryDate = asNumber(raw.expiryDate);
  const tokenName = asString(raw.tokenName) || undefined;
  const tokenType = asString(raw.tokenType) || undefined;
  if (!jwtToken && expiryDate === undefined && !tokenName && !tokenType) {
    return null;
  }
  return { jwtToken, expiryDate, tokenName, tokenType };
}

function mapAuthMechanismList(payload: unknown): UserAuthMechanism[] {
  const root = asRecord(payload);
  const items = Array.isArray(payload) ? payload : Array.isArray(root?.data) ? root.data : [];
  return items.flatMap((item) => {
    const rec = asRecord(item);
    return rec ? [mapAuthMechanism(rec)].filter((m): m is UserAuthMechanism => m !== null) : [];
  });
}

/** Official getUserAccessToken (rest/userAPI.ts:203-210): GET, returns data array. */
export function getUserAccessToken(): Promise<UserAuthMechanism[]> {
  return apiRequest<unknown>('/v1/users/security/token').then(mapAuthMechanismList);
}

/**
 * Official updateUserAccessToken (rest/userAPI.ts:211-224): PUT
 * {JWTTokenExpiry, tokenName}, returns the single mechanism. The pin
 * card always passes the literal tokenName 'test'; that literal lives
 * at the call site (userLogic.ts), not here.
 */
export async function updateUserAccessToken(
  JWTTokenExpiry: JwtTokenExpiry,
  tokenName: string,
): Promise<UserAuthMechanism | null> {
  const raw = await apiRequest<unknown>('/v1/users/security/token', {
    method: 'PUT',
    json: { JWTTokenExpiry, tokenName },
  });
  const rec = asRecord(raw);
  return rec ? mapAuthMechanism(rec) : null;
}

/**
 * Official revokeAccessToken (rest/userAPI.ts:232-234): PUT
 * /security/token/revoke?removeAll=true with NO body, returns the
 * remaining mechanisms array. The former product helper sent a
 * {tokenIds} body — that shape is deleted with P6.
 */
export function revokeUserAccessToken(): Promise<UserAuthMechanism[]> {
  return apiRequest<unknown>('/v1/users/security/token/revoke', {
    method: 'PUT',
    query: { removeAll: true },
  }).then(mapAuthMechanismList);
}

/**
 * JWT expiry options (pin BotsUtils getJWTTokenExpiryOptions +
 * TOKEN_EXPIRY_NUMERIC_VALUES_IN_DAYS). The user form filters out
 * Unlimited (6 items); the bot form keeps all 7. Sorted by days.
 */
export const TOKEN_EXPIRY_NUMERIC_VALUES_IN_DAYS: Record<JwtTokenExpiry, number> = {
  OneHour: 0.0417,
  '1': 1,
  '7': 7,
  '30': 30,
  '60': 60,
  '90': 90,
  Unlimited: Infinity,
};

export function getJwtTokenExpiryOptions(filterUnlimited: boolean): JwtTokenExpiry[] {
  const values = (Object.keys(TOKEN_EXPIRY_NUMERIC_VALUES_IN_DAYS) as JwtTokenExpiry[])
    .filter((value) => !filterUnlimited || value !== 'Unlimited')
    .sort(
      (a, b) =>
        TOKEN_EXPIRY_NUMERIC_VALUES_IN_DAYS[a] - TOKEN_EXPIRY_NUMERIC_VALUES_IN_DAYS[b],
    );
  return values;
}

// ---------------------------------------------------------------------------
// Change password + random password (pin rest/auth-API.ts). The endpoints
// live under /users, so they sit in this module; api/auth.ts owns the
// session calls and is untouched. A future move to api/auth.ts is an
// integration-line option, not a Members requirement.
// ---------------------------------------------------------------------------

export interface ChangePasswordPayload {
  confirmPassword: string;
  newPassword: string;
  oldPassword?: string;
  requestType?: 'SELF' | 'USER';
  username?: string;
}

/** Official changePassword (rest/auth-API.ts:91-95): PUT /users/changePassword. */
export function changePassword(payload: ChangePasswordPayload): Promise<unknown> {
  return apiRequest('/v1/users/changePassword', {
    method: 'PUT',
    json: payload,
  });
}

/** Official generateRandomPwd (rest/auth-API.ts:96-100): GET /users/generateRandomPwd. */
export function generateRandomPassword(): Promise<string> {
  return apiRequest<unknown>('/v1/users/generateRandomPwd').then((payload) =>
    typeof payload === 'string' ? payload : asString(asRecord(payload)?.password),
  );
}
