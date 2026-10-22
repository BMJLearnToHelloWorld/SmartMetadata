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

