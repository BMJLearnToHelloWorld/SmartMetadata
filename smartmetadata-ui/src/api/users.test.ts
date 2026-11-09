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
  assignUserRolesPatch,
  createPersonalToken,
  createUser,
  deactivateUser,
  generateUserToken,
  getUserFollows,
  listOnlineUsers,
  listPersonalTokens,
  listUsers,
  restoreUser,
  revokePersonalTokens,
  searchUsers,
} from './users';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
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
        new Response(
          JSON.stringify({
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
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
        return new Response(JSON.stringify({ id: 'u2', name: 'bob', email: 'bob@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
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

  it('soft-deletes via DELETE /v1/users/{id} and restores via PUT /v1/users/restore', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'u1' }), { status: 200 })),
    );
    await deactivateUser('u1');
    expect(lastFetch().url).toContain('/api/v1/users/u1');
    expect(lastFetch().init?.method).toBe('DELETE');

    await restoreUser('u1');
    expect(lastFetch().url).toContain('/api/v1/users/restore');
    expect(lastFetch().init?.method).toBe('PUT');
    expect(JSON.parse(String(lastFetch().init?.body))).toEqual({ id: 'u1' });
  });

  it('builds a JSON Patch that assigns roles without inventing an authz engine', () => {
    const patch = assignUserRolesPatch([], ['role-1']);
    expect(patch).toEqual([{ op: 'replace', path: '/roles', value: [{ id: 'role-1', type: 'role' }] }]);
  });

  it('lists online users from GET /v1/users/online with activity timestamps', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
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
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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

  it('searches users on the server user index', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            hits: {
              total: { value: 1 },
              hits: [{ _id: 'u1', _source: { id: 'u1', name: 'alice', email: 'alice@example.com', entityType: 'user' } }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await searchUsers('alice');
    expect(page.data[0].name).toBe('alice');
    expect(lastFetch().url).toContain('/api/v1/search/query');
    expect(lastFetch().url).toContain('index=user');
    expect(lastFetch().url).toContain('q=alice');
  });
});

describe('users personal access tokens (P2 B5)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists own tokens and maps the revoke key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ token: 'tok-1', tokenName: 'cli', tokenType: 'PERSONAL', expiryDate: '2026-12-01' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listPersonalTokens();
    expect(lastFetch().url).toContain('/api/v1/users/security/token');
    expect(page.data[0]).toMatchObject({ token: 'tok-1', tokenName: 'cli', expiryDate: '2026-12-01' });
  });

  it('creates with tokenName + JWTTokenExpiry via PUT and surfaces the one-time secret', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ token: 'tok-2', tokenName: 'cli', jwtToken: 'secret-xyz' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const created = await createPersonalToken('cli', '30');
    const call = lastFetch();
    expect(call.url).toContain('/api/v1/users/security/token');
    expect(call.init?.method).toBe('PUT');
    expect(JSON.parse(String(call.init?.body))).toEqual({ tokenName: 'cli', JWTTokenExpiry: '30' });
    expect(created?.secret).toBe('secret-xyz');
  });

  it('revokes by tokenIds and revokes all for an admin with username + removeAll', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    await revokePersonalTokens(['tok-1']);
    expect(lastFetch().url).toContain('/api/v1/users/security/token/revoke');
    expect(JSON.parse(String(lastFetch().init?.body))).toEqual({ tokenIds: ['tok-1'] });
    await revokePersonalTokens([], { username: 'alice', removeAll: true });
    expect(lastFetch().url).toContain('username=alice');
    expect(lastFetch().url).toContain('removeAll=true');
  });

  it('generates an admin token for a user id via PUT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ token: 'tok-3', jwtToken: 'secret-abc' }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    const created = await generateUserToken('u1', '7');
    expect(lastFetch().url).toContain('/api/v1/users/generateToken/u1');
    expect(lastFetch().init?.method).toBe('PUT');
    expect(created?.secret).toBe('secret-abc');
  });

  it('reads bookmarks from the user follows field, keeping only pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'u1',
            name: 'alice',
            follows: [
              { id: 'p1', type: 'page', name: 'getting-started' },
              { id: 't1', type: 'table', name: 'orders' },
              { id: 'p2', type: 'page', name: 'guide', displayName: 'Guide' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const follows = await getUserFollows('u1');
    expect(lastFetch().url).toContain('/api/v1/users/u1');
    expect(lastFetch().url).toContain('fields=follows');
    expect(follows.map((ref) => ref.name)).toEqual(['getting-started', 'guide']);
  });
});
