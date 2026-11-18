/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  assignUserDefaultPersonaPatch,
  assignUserDomainsPatch,
  assignUserPersonasPatch,
  assignUserRolesPatch,
  assignUserRolesWithAdminPatch,
  assignUserTeamsPatch,
  buildAdminUserQueryFilter,
  buildOnlineUserSearchQueryFilter,
  buildUserSearchQueryFilter,
  changePassword,
  createUser,
  createUserWithPut,
  deactivateUser,
  generateRandomPassword,
  getJwtTokenExpiryOptions,
  getUserAccessToken,
  getUserById,
  getUserByName,
  getUserFollows,
  listOnlineUsers,
  listUsers,
  mapUser,
  restoreUser,
  revokeUserAccessToken,
  searchUsers,
  updateUserAccessToken,
  updateUserDetail,
} from './users';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('users API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists users with team, admin, bot, and include filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'u1',
              name: 'alice',
              email: 'alice@example.com',
              isAdmin: true,
              teams: [{ id: 't1', name: 'Engineering', type: 'team' }],
              roles: [{ id: 'r1', name: 'DataConsumer', type: 'role' }],
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );

    const page = await listUsers({ team: 'Engineering', isAdmin: true, isBot: false, include: 'non-deleted' });
    expect(page.data).toHaveLength(1);
    expect(page.data[0].email).toBe('alice@example.com');
    expect(page.data[0].roles[0].name).toBe('DataConsumer');
    const { url } = lastFetch();
    expect(url).toContain('/api/v1/users');
    expect(url).toContain('team=Engineering');
    expect(url).toContain('isAdmin=true');
    expect(url).toContain('isBot=false');
    expect(url).toContain('include=non-deleted');
  });

  it('creates a user with ADMIN_CREATE password fields the schema supports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body.name).toBe('bob');
        expect(body.email).toBe('bob@example.com');
        expect(body.createPasswordType).toBe('ADMIN_CREATE');
        expect(body.password).toBe('secret');
        return jsonResponse({ id: 'u2', name: 'bob', email: 'bob@example.com' });
      }),
    );

    const user = await createUser({
      name: 'bob',
      email: 'bob@example.com',
      password: 'secret',
      confirmPassword: 'secret',
      createPasswordType: 'ADMIN_CREATE',
    });
    expect(user.id).toBe('u2');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('creates a bot user with PUT and keeps the throw-on-missing mapping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'u3', name: 'ingestion-bot' })));
    const user = await createUserWithPut({ name: 'ingestion-bot', email: 'bot@example.com', isBot: true });
    expect(user.id).toBe('u3');
    expect(lastFetch().init?.method).toBe('PUT');
    expect(lastFetch().url).toContain('/api/v1/users');
  });

  it('soft-deletes via DELETE /v1/users/{id} and restores via PUT /v1/users/restore', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'u1' })));
    await deactivateUser('u1');
    expect(lastFetch().url).toContain('/api/v1/users/u1');
    expect(lastFetch().init?.method).toBe('DELETE');

    await restoreUser('u1');
    expect(lastFetch().url).toContain('/api/v1/users/restore');
    expect(lastFetch().init?.method).toBe('PUT');
    expect(JSON.parse(String(lastFetch().init?.body))).toEqual({ id: 'u1' });
  });

  it('passes explicit hardDelete/recursive options to the delete call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await deactivateUser('u1', { hardDelete: true, recursive: true });
    expect(lastFetch().url).toContain('hardDelete=true');
    expect(lastFetch().url).toContain('recursive=true');
  });

  it('builds a JSON Patch that assigns roles without inventing an authz engine', () => {
    const patch = assignUserRolesPatch([], ['role-1']);
    expect(patch).toEqual([{ op: 'replace', path: '/roles', value: [{ id: 'role-1', type: 'role' }] }]);
  });

  it('builds a JSON Patch that assigns teams without inventing an authz engine', () => {
    const patch = assignUserTeamsPatch([], ['team-1']);
    expect(patch).toEqual([{ op: 'replace', path: '/teams', value: [{ id: 'team-1', type: 'team' }] }]);
  });

  it('folds isAdmin into the roles patch and builds persona/domain/default-persona patches', () => {
    expect(assignUserRolesWithAdminPatch([], false, ['r1'], true)).toEqual([
      { op: 'replace', path: '/roles', value: [{ id: 'r1', type: 'role' }] },
      { op: 'replace', path: '/isAdmin', value: true },
    ]);
    expect(assignUserPersonasPatch(undefined, ['p1'])).toEqual([
      { op: 'add', path: '/personas', value: [{ id: 'p1', type: 'persona' }] },
    ]);
    expect(assignUserDomainsPatch([], ['d1'])).toEqual([
      { op: 'replace', path: '/domains', value: [{ id: 'd1', type: 'domain' }] },
    ]);
    expect(assignUserDefaultPersonaPatch({ id: 'p1' }, undefined)).toEqual([
      { op: 'remove', path: '/defaultPersona' },
    ]);
    expect(assignUserDefaultPersonaPatch(undefined, undefined)).toEqual([]);
    expect(assignUserDefaultPersonaPatch(undefined, 'p2')).toEqual([
      { op: 'add', path: '/defaultPersona', value: { id: 'p2', type: 'persona' } },
    ]);
  });

  it('lists online users from GET /v1/users/online with activity timestamps', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'u1',
              name: 'alice',
              lastLoginTime: 1735689600000,
              lastActivityTime: 1735689700000,
              teams: [],
              roles: [],
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listOnlineUsers({ timeWindow: 60 });
    expect(page.data[0].lastActivityTime).toBe(1735689700000);
    expect(page.data[0].lastLoginTime).toBe(1735689600000);
    const { url } = lastFetch();
    expect(url).toContain('/api/v1/users/online');
    expect(url).toContain('timeWindow=60');
    expect(url).toContain('lastActivityTime');
  });

  it('searches users on the server user index and keeps activity timestamps', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _id: 'u1',
                _source: {
                  id: 'u1',
                  name: 'alice',
                  email: 'alice@example.com',
                  entityType: 'user',
                  lastLoginTime: 11,
                  lastActivityTime: 22,
                },
              },
            ],
          },
        }),
      ),
    );
    const page = await searchUsers('alice');
    expect(page.data[0].name).toBe('alice');
    expect(page.data[0].lastLoginTime).toBe(11);
    expect(page.data[0].lastActivityTime).toBe(22);
    expect(lastFetch().url).toContain('/api/v1/search/query');
    expect(lastFetch().url).toContain('index=user');
    expect(lastFetch().url).toContain('q=alice');
  });

  it('reads bookmarks from the user follows field, keeping only pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'u1',
          name: 'alice',
          follows: [
            { id: 'p1', type: 'page', name: 'getting-started' },
            { id: 't1', type: 'table', name: 'orders' },
            { id: 'p2', type: 'page', name: 'guide', displayName: 'Guide' },
          ],
        }),
      ),
    );
    const follows = await getUserFollows('u1');
    expect(lastFetch().url).toContain('/api/v1/users/u1');
    expect(lastFetch().url).toContain('fields=follows');
    expect(follows.map((ref) => ref.name)).toEqual(['getting-started', 'guide']);
  });

  it('fetches by name with fields/include options and keeps the throw-on-missing mapping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 'u1', name: 'alice', teams: [], roles: [] })),
    );
    const user = await getUserByName('alice', { fields: ['teams', 'roles', 'profile'], include: 'all' });
    expect(user.id).toBe('u1');
    const { url } = lastFetch();
    expect(url).toContain('/api/v1/users/name/alice');
    expect(url).toContain('fields=teams%2Croles%2Cprofile');
    expect(url).toContain('include=all');

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(getUserByName('ghost')).rejects.toThrow('missing id and name');
  });

  it('updateUserDetail PATCHes the user and returns the mapped entity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'u1',
          name: 'bot',
          isAdmin: true,
          allowImpersonation: true,
          roles: [{ id: 'r1', name: 'DataSteward', type: 'role' }],
          inheritedRoles: [{ id: 'r2', name: 'Catalog', type: 'role' }],
          teams: [{ id: 't1', name: 'Team', type: 'team' }],
          profile: { images: { image: 'x' } },
        }),
      ),
    );
    const updated = await updateUserDetail('u1', [
      { op: 'replace', path: '/isAdmin', value: true },
    ]);
    expect(updated.allowImpersonation).toBe(true);
    expect(updated.roles).toHaveLength(1);
    expect(updated.inheritedRoles).toHaveLength(1);
    expect(updated.teams).toHaveLength(1);
    expect(updated.profile).toEqual({ images: { image: 'x' } });
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/users/u1');
    expect(init?.method).toBe('PATCH');

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(updateUserDetail('u1', [])).rejects.toThrow('missing id and name');
  });

  it('mapUser carries allowImpersonation and requires id or name', () => {
    expect(mapUser({ id: 'u1', name: 'bot', allowImpersonation: true })?.allowImpersonation).toBe(
      true,
    );
    expect(mapUser({ name: 'x' })).not.toBeNull();
    expect(mapUser({})).toBeNull();
  });

  it('fetches by id with caller-chosen fields/include and no baked-in fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 'u1', name: 'alice', teams: [], roles: [] })),
    );
    const user = await getUserById('u1', { fields: ['teams', 'roles'] });
    expect(user.id).toBe('u1');
    const { url } = lastFetch();
    expect(url).toContain('/api/v1/users/u1');
    expect(url).toContain('fields=teams%2Croles');
    expect(url).not.toContain('include=');

    const detail = await getUserById('u1', { fields: ['personas', 'defaultPersona'], include: 'all' });
    expect(detail.id).toBe('u1');
    expect(lastFetch().url).toContain('fields=personas%2CdefaultPersona');
    expect(lastFetch().url).toContain('include=all');

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(getUserById('ghost')).rejects.toThrow('missing id and name');
  });

  it('builds list search filters with an explicit isBot:false term', () => {
    const usersFilter = JSON.parse(buildUserSearchQueryFilter(false)) as {
      query: { bool: { must: Array<{ term: Record<string, string> }> } };
    };
    expect(usersFilter.query.bool.must).toContainEqual({ term: { isAdmin: 'false' } });
    expect(usersFilter.query.bool.must).toContainEqual({ term: { isBot: 'false' } });
    expect(JSON.parse(buildAdminUserQueryFilter())).toEqual(JSON.parse(buildUserSearchQueryFilter(true)));
    expect(JSON.parse(buildOnlineUserSearchQueryFilter())).toEqual({
      query: { bool: { must: [{ term: { isBot: 'false' } }] } },
    });
  });

  it('changes passwords via PUT /v1/users/changePassword and generates random passwords', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    await changePassword({ confirmPassword: 'n1', newPassword: 'n1', oldPassword: 'o1', requestType: 'SELF', username: 'alice' });
    expect(lastFetch().url).toContain('/api/v1/users/changePassword');
    expect(lastFetch().init?.method).toBe('PUT');
    expect(JSON.parse(String(lastFetch().init?.body))).toMatchObject({ requestType: 'SELF', username: 'alice' });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify('rand-1'), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(generateRandomPassword()).resolves.toBe('rand-1');
  });
});

describe('users single JWT card (P6: the token-list helpers are deleted)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads the token array and maps the first mechanism', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ jwtToken: 'tok-1', tokenName: 'test', tokenType: 'PersonalAccessToken', expiryDate: 1735689600000 }],
        }),
      ),
    );
    const mechanisms = await getUserAccessToken();
    expect(lastFetch().url).toContain('/api/v1/users/security/token');
    expect(mechanisms).toEqual([
      { jwtToken: 'tok-1', tokenName: 'test', tokenType: 'PersonalAccessToken', expiryDate: 1735689600000 },
    ]);
  });

  it('updates via PUT {JWTTokenExpiry, tokenName} and returns the single mechanism', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ jwtToken: 'tok-2', tokenName: 'test', tokenType: 'PersonalAccessToken', expiryDate: 99 }),
      ),
    );
    const mechanism = await updateUserAccessToken('30', 'test');
    const call = lastFetch();
    expect(call.url).toContain('/api/v1/users/security/token');
    expect(call.init?.method).toBe('PUT');
    expect(JSON.parse(String(call.init?.body))).toEqual({ tokenName: 'test', JWTTokenExpiry: '30' });
    expect(mechanism?.jwtToken).toBe('tok-2');
  });

  it('revokes with removeAll=true and no body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [] })));
    const remaining = await revokeUserAccessToken();
    expect(lastFetch().url).toContain('/api/v1/users/security/token/revoke');
    expect(lastFetch().url).toContain('removeAll=true');
    expect(lastFetch().init?.method).toBe('PUT');
    expect(lastFetch().init?.body).toBeUndefined();
    expect(remaining).toEqual([]);
  });

  it('offers 6 expiry options for users and 7 for bots, sorted by days', () => {
    expect(getJwtTokenExpiryOptions(true)).toEqual(['OneHour', '1', '7', '30', '60', '90']);
    expect(getJwtTokenExpiryOptions(false)).toEqual(['OneHour', '1', '7', '30', '60', '90', 'Unlimited']);
  });
});
