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
import { createTeam, removeTeamUser, replaceTeamUsers } from './teams';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
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
        return new Response(JSON.stringify({ id: 't1', name: 'data-eng', teamType: 'Group' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const team = await createTeam({ name: 'data-eng', teamType: 'Group', isJoinable: true });
    expect(team.id).toBe('t1');
    expect(lastFetch().url).toContain('/api/v1/teams');
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

  it('removes a member through DELETE /v1/teams/{teamId}/users/{userId}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await removeTeamUser('team-1', 'user-a');
    expect(lastFetch().url).toContain('/api/v1/teams/team-1/users/user-a');
    expect(lastFetch().init?.method).toBe('DELETE');
  });
});
