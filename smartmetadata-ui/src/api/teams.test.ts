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
  assignTeamDefaultPersonaPatch,
  assignTeamDomainsPatch,
  assignTeamOwnersPatch,
  assignTeamParentsPatch,
  assignTeamPoliciesPatch,
  buildTeamChildSearchFilter,
  buildTeamMembersSearchFilter,
  createTeam,
  deleteTeam,
  exportTeam,
  exportUsersOfTeam,
  getTeamByName,
  getTeamsAssetCounts,
  getTeamsHierarchy,
  importTeam,
  importUsersInTeam,
  listTeams,
  removeTeamUser,
  replaceTeamUsers,
  restoreTeam,
  searchTeams,
  setTeamEmailPatch,
  setTeamSubscriptionPatch,
} from './teams';

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

describe('teams API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('creates a team with the schema-required name and teamType', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { name?: string; teamType?: string };
        expect(body).toMatchObject({ name: 'data-eng', teamType: 'Group' });
        return jsonResponse({ id: 't1', name: 'data-eng', teamType: 'Group' });
      }),
    );
    const team = await createTeam({ name: 'data-eng', teamType: 'Group', isJoinable: true });
    expect(team.id).toBe('t1');
    expect(lastFetch().url).toContain('/api/v1/teams');
  });

  it('sends the exact 8-field create payload with parents built from the parent id (P3)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual([
          'description',
          'displayName',
          'domains',
          'email',
          'isJoinable',
          'name',
          'parents',
          'teamType',
        ]);
        expect(body.parents).toEqual(['parent-1']);
        expect(body).not.toHaveProperty('defaultRoles');
        expect(body).not.toHaveProperty('users');
        return jsonResponse({ id: 't1', name: 'data-eng', teamType: 'Group' });
      }),
    );
    await createTeam(
      {
        name: 'data-eng',
        teamType: 'Group',
        displayName: 'Data Eng',
        description: 'd',
        email: 'team@example.com',
        domains: ['sales'],
        isJoinable: false,
      },
      'parent-1',
    );
  });

  it('omits parents from the create payload without a parent team', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body.parents).toBeUndefined();
        return jsonResponse({ id: 't1', name: 'data-eng', teamType: 'Group' });
      }),
    );
    await createTeam({ name: 'data-eng', teamType: 'Group' });
  });

  it('replaces membership through PUT /v1/teams/{id}/users', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await replaceTeamUsers('team-1', ['user-a', 'user-b']);
    expect(lastFetch().url).toContain('/api/v1/teams/team-1/users');
    expect(lastFetch().init?.method).toBe('PUT');
    expect(JSON.parse(String(lastFetch().init?.body))).toEqual([
      { id: 'user-a', type: 'user' },
      { id: 'user-b', type: 'user' },
    ]);
  });

  it('fetches the Organization team by name for the Data Insight summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 'org', name: 'Organization', displayName: 'Acme Org' })),
    );
    const team = await getTeamByName('Organization');
    expect(team.displayName).toBe('Acme Org');
    expect(lastFetch().url).toContain('/api/v1/teams/name/Organization');
  });

  it('fetches by name with fields/include options and keeps the throw-on-missing mapping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 't1', name: 'a', teamType: 'Group' })));
    await getTeamByName('a', { fields: ['parents', 'userCount'], include: 'all' });
    expect(lastFetch().url).toContain('fields=parents%2CuserCount');
    expect(lastFetch().url).toContain('include=all');

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(getTeamByName('ghost')).rejects.toThrow('missing id and name');
  });

  it('lists teams with an optional fields override and parentTeam', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })));
    await listTeams({ fields: '', parentTeam: 'Organization', include: 'all' });
    const { url } = lastFetch();
    expect(url).toContain('parentTeam=Organization');
    expect(url).not.toContain('fields=');
  });

  it('fetches the hierarchy with the isJoinable flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [{ id: 't1', name: 'a', teamType: 'Group' }] })));
    const teams = await getTeamsHierarchy(true);
    expect(teams).toHaveLength(1);
    expect(lastFetch().url).toContain('/api/v1/teams/hierarchy');
    expect(lastFetch().url).toContain('isJoinable=true');
  });

  it('removes a member through DELETE /v1/teams/{teamId}/users/{userId}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await removeTeamUser('team-1', 'user-a');
    expect(lastFetch().url).toContain('/api/v1/teams/team-1/users/user-a');
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('deletes with hardDelete/recursive and restores via PUT /v1/teams/restore', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await deleteTeam('t1', { hardDelete: false, recursive: true });
    expect(lastFetch().url).toContain('/api/v1/teams/t1');
    expect(lastFetch().url).toContain('hardDelete=false');
    expect(lastFetch().url).toContain('recursive=true');
    expect(lastFetch().init?.method).toBe('DELETE');

    await restoreTeam('t1');
    expect(lastFetch().url).toContain('/api/v1/teams/restore');
    expect(JSON.parse(String(lastFetch().init?.body))).toEqual({ id: 't1' });
  });

  it('exports teams and team users and returns the job id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ jobId: 'job-1' })));
    await expect(exportTeam('data-eng')).resolves.toEqual({ jobId: 'job-1' });
    expect(lastFetch().url).toContain('/api/v1/teams/name/data-eng/exportAsync');
    await expect(exportUsersOfTeam('data-eng')).resolves.toEqual({ jobId: 'job-1' });
    expect(lastFetch().url).toContain('/api/v1/users/exportAsync');
    expect(lastFetch().url).toContain('team=data-eng');
  });

  it('imports CSV as text/plain with dryRun and returns the async response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ jobId: 'job-2', message: 'ok' })));
    await expect(importTeam('data-eng', 'a,b', false)).resolves.toEqual({ jobId: 'job-2', message: 'ok' });
    expect(lastFetch().url).toContain('/api/v1/teams/name/data-eng/importAsync');
    expect(lastFetch().url).toContain('dryRun=false');
    expect(lastFetch().init?.body).toBe('a,b');
    expect(lastFetch().init?.method).toBe('PUT');

    await importUsersInTeam('data-eng', 'x,y');
    expect(lastFetch().url).toContain('/api/v1/users/importAsync');
    expect(lastFetch().url).toContain('team=data-eng');
    expect(lastFetch().url).toContain('dryRun=true');
  });

  it('reads the team asset counts map, keeping numeric values only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ 'org.a': 3, 'org.b': 'x' })));
    await expect(getTeamsAssetCounts()).resolves.toEqual({ 'org.a': 3 });
    expect(lastFetch().url).toContain('/api/v1/teams/assets/counts');
  });

  it('builds the child search filter and the member terms filter', () => {
    expect(JSON.parse(buildTeamChildSearchFilter('t1'))).toEqual({
      query: {
        bool: {
          must: [{ term: { 'parents.id': 't1' } }],
          must_not: [{ term: { 'name.keyword': 'Organization' } }],
        },
      },
    });
    expect(JSON.parse(buildTeamMembersSearchFilter(['t1', 't2']))).toEqual({
      query: { bool: { must: [{ terms: { 'teams.id': ['t1', 't2'] } }] } },
    });
  });

  it('searches the team index', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ hits: { total: { value: 1 }, hits: [{ _id: 't1', _source: { id: 't1', name: 'a', teamType: 'Group' } }] } }),
      ),
    );
    const page = await searchTeams('*a*', 0, 10, 'filter', { includeDeleted: true });
    expect(page.data[0].name).toBe('a');
    expect(lastFetch().url).toContain('index=team');
    expect(lastFetch().url).toContain('deleted=true');
  });

  it('builds the §6.4 whitelist patch builders', () => {
    expect(assignTeamPoliciesPatch([], ['p1'])).toEqual([
      { op: 'replace', path: '/policies', value: [{ id: 'p1', type: 'policy' }] },
    ]);
    expect(
      assignTeamOwnersPatch(undefined, [
        { id: 'u1', type: 'user' },
        { id: 't1', type: 'team' },
      ]),
    ).toEqual([
      {
        op: 'add',
        path: '/owners',
        value: [
          { id: 'u1', type: 'user' },
          { id: 't1', type: 'team' },
        ],
      },
    ]);
    expect(assignTeamDomainsPatch([], ['d1'])).toEqual([
      { op: 'replace', path: '/domains', value: [{ id: 'd1', type: 'domain' }] },
    ]);
    expect(assignTeamDefaultPersonaPatch({ id: 'p1' }, undefined)).toEqual([
      { op: 'remove', path: '/defaultPersona' },
    ]);
    expect(assignTeamParentsPatch([{ id: 'old' }], 'new-parent')).toEqual([
      { op: 'replace', path: '/parents', value: [{ id: 'new-parent', type: 'team' }] },
    ]);
    expect(assignTeamParentsPatch([{ id: 'old' }], undefined)).toEqual([{ op: 'remove', path: '/parents' }]);
    expect(setTeamEmailPatch('old@x.com', '  ')).toEqual([{ op: 'remove', path: '/email' }]);
    expect(setTeamEmailPatch(undefined, 'n@x.com')).toEqual([{ op: 'add', path: '/email', value: 'n@x.com' }]);
    expect(setTeamSubscriptionPatch(undefined, 'slack', 'https://hooks/x')).toEqual([
      { op: 'add', path: '/profile', value: { subscription: { slack: { endpoint: 'https://hooks/x' } } } },
    ]);
    expect(setTeamSubscriptionPatch({ subscription: { slack: { endpoint: 'e' } } }, undefined)).toEqual([
      { op: 'remove', path: '/profile/subscription' },
    ]);
  });
});
