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
import { AUTH_STORAGE_KEY, persistSession } from '@/auth/token';
import { apiRequest } from './client';

describe('apiRequest', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, {
      accessToken: 'stale-token',
      tokenType: 'Bearer',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('dispatches sm:session-expired when an authenticated call returns 401', async () => {
    const seen: string[] = [];
    const listener = () => seen.push('expired');
    window.addEventListener('sm:session-expired', listener);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"expired"}', { status: 401 })));
    await expect(apiRequest('/v1/search/query')).rejects.toMatchObject({ status: 401 });
    expect(seen).toEqual(['expired']);
    window.removeEventListener('sm:session-expired', listener);
  });

  it('drops the stored session when an authenticated call returns 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"expired"}', { status: 401 })),
    );
    await expect(apiRequest('/v1/search/query')).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('keeps the session when login itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"bad credentials"}', { status: 401 })),
    );
    await expect(apiRequest('/v1/users/login', { auth: false, json: {} })).rejects.toMatchObject({
      status: 401,
    });
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeTruthy();
  });

  it('retries once after a successful silent refresh instead of expiring', async () => {
    persistSession(localStorage, {
      accessToken: 'stale-token',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
      email: 'ada@example.org',
    });
    const seen: string[] = [];
    const listener = () => seen.push('expired');
    window.addEventListener('sm:session-expired', listener);
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls += 1;
        if (url.includes('/v1/auth/refresh')) {
          return new Response(
            JSON.stringify({ accessToken: 'fresh-token', refreshToken: 'refresh-2', tokenType: 'Bearer' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (calls === 1) {
          return new Response('{"message":"expired"}', { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await expect(apiRequest('/v1/search/query')).resolves.toEqual({ ok: true });
    expect(seen).toEqual([]);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toContain('fresh-token');
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toContain('refresh-2');
    window.removeEventListener('sm:session-expired', listener);
  });

  it('falls back to the expiry path when the silent refresh fails', async () => {
    persistSession(localStorage, {
      accessToken: 'stale-token',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
    });
    const seen: string[] = [];
    const listener = () => seen.push('expired');
    window.addEventListener('sm:session-expired', listener);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"expired"}', { status: 401 })));
    await expect(apiRequest('/v1/search/query')).rejects.toMatchObject({ status: 401 });
    expect(seen).toEqual(['expired']);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    window.removeEventListener('sm:session-expired', listener);
  });

  it('does not attempt a refresh when the session has no refresh token', async () => {
    const seen: string[] = [];
    const listener = () => seen.push('expired');
    window.addEventListener('sm:session-expired', listener);
    const mock = vi.fn(async () => new Response('{"message":"expired"}', { status: 401 }));
    vi.stubGlobal('fetch', mock);
    await expect(apiRequest('/v1/search/query')).rejects.toMatchObject({ status: 401 });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['expired']);
    window.removeEventListener('sm:session-expired', listener);
  });

  it('sends JSON Patch with the RFC 6902 content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('PATCH');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
          'application/json-patch+json',
        );
        expect(JSON.parse(String(init?.body))).toEqual([{ op: 'replace', path: '/roles', value: [] }]);
        return new Response('{}', { status: 200 });
      }),
    );
    await apiRequest('/v1/users/u1', {
      method: 'PATCH',
      json: [{ op: 'replace', path: '/roles', value: [] }],
      contentType: 'application/json-patch+json',
    });
  });
});

