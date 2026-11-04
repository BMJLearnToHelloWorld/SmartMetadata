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
import { getVoteStatus, voteAsset } from './votes';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('votes API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('votes via PUT /v1/{collection}/{id}/vote with updatedVoteType', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('PUT');
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ updatedVoteType: 'votedUp' });
        return new Response(JSON.stringify({ eventType: 'ENTITY_UPDATED' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await voteAsset('table', 't-1', 'votedUp');
    expect(lastFetch().url).toContain('/api/v1/tables/t-1/vote');
  });

  it('rejects entity types without a vote endpoint', async () => {
    await expect(voteAsset('tableColumn', 'c-1', 'votedUp')).rejects.toThrow();
  });

  it('derives vote status from the voter lists, never from counts', () => {
    const votes = {
      upVotes: 5,
      downVotes: 1,
      upVoters: [{ id: 'u2', name: 'bob' }],
      downVoters: [{ id: 'u1', name: 'amy' }],
    };
    expect(getVoteStatus('u1', votes)).toBe('votedDown');
    expect(getVoteStatus('u2', votes)).toBe('votedUp');
    expect(getVoteStatus('u3', votes)).toBe('unVoted');
    expect(getVoteStatus('u1', undefined)).toBe('unVoted');
  });
});
