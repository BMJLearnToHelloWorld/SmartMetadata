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
import type { EntityRef } from '@/types/api';
import {
  applyFollowChange,
  applyUnfollowChange,
  followService,
  isServiceFollowing,
  unfollowService,
} from './serviceFollowers';

const ANN: EntityRef = { id: 'u1', name: 'ann', type: 'user' };
const BOB: EntityRef = { id: 'u2', name: 'bob', type: 'user' };

describe('service followers API (pin serviceAPI.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function lastCall(): { url: string; init?: RequestInit } {
    const call = vi.mocked(fetch).mock.calls.at(-1);
    if (!call) {
      throw new Error('fetch was not called');
    }
    return { url: String(call[0]), init: call[1] };
  }

  it('PUTs the user id as a JSON string to the followers collection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'svc-1', changeDescription: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const payload = await followService('database', 'svc-1', 'u1');
    const { url, init } = lastCall();
    expect(url).toContain('/api/v1/services/databaseServices/svc-1/followers');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe('"u1"');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(payload.id).toBe('svc-1');
  });

  it('DELETEs the follower by user id under the kind collection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'svc-2' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await unfollowService('messaging', 'svc-2', 'u2');
    const { url, init } = lastCall();
    expect(url).toContain('/api/v1/services/messagingServices/svc-2/followers/u2');
    expect(init?.method).toBe('DELETE');
  });
});

describe('follow merge helpers (pin classic ServiceDetailsPage)', () => {
  it('appends every reference from fieldsAdded[0].newValue, which is an array', () => {
    const merged = applyFollowChange([ANN], {
      changeDescription: {
        fieldsAdded: [
          {
            name: 'followers',
            newValue: [
              { id: 'u2', name: 'bob', type: 'user' },
              { id: 'u3', name: 'cid', type: 'user' },
            ],
          },
        ],
      },
    });
    expect(merged).toEqual([ANN, BOB, { id: 'u3', name: 'cid', type: 'user' }]);
  });

  it('drops the follower named by fieldsDeleted[0].oldValue[0].id', () => {
    const merged = applyUnfollowChange([ANN, BOB], {
      changeDescription: {
        fieldsDeleted: [
          { name: 'followers', oldValue: [{ id: 'u1', name: 'ann', type: 'user' }] },
        ],
      },
    });
    expect(merged).toEqual([BOB]);
  });

  it('throws a descriptive error when the expected entry is absent', () => {
    expect(() => applyFollowChange([ANN], {})).toThrow('no changeDescription');
    expect(() =>
      applyFollowChange([ANN], { changeDescription: { fieldsAdded: [] } }),
    ).toThrow('no added follower');
    expect(() =>
      applyFollowChange([ANN], {
        changeDescription: { fieldsAdded: [{ name: 'followers' }] },
      }),
    ).toThrow('no added follower');
    expect(() =>
      applyFollowChange([ANN], {
        changeDescription: { fieldsAdded: [{ name: 'followers', newValue: [] }] },
      }),
    ).toThrow('no added follower');
    expect(() => applyUnfollowChange([ANN], {})).toThrow('no changeDescription');
    expect(() =>
      applyUnfollowChange([ANN], { changeDescription: { fieldsDeleted: [] } }),
    ).toThrow('no removed follower');
    expect(() =>
      applyUnfollowChange([ANN], {
        changeDescription: { fieldsDeleted: [{ name: 'followers', oldValue: [] }] },
      }),
    ).toThrow('no removed follower');
  });

  it('reads follow state from follower membership', () => {
    expect(isServiceFollowing([ANN, BOB], 'u1')).toBe(true);
    expect(isServiceFollowing([ANN], 'u2')).toBe(false);
    expect(isServiceFollowing(undefined, 'u1')).toBe(false);
  });
});
