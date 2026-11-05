/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { useAuthStore } from '@/stores/auth';
import { router } from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * N1 regression: an admin opening an unmapped /admin/* route directly
 * (fresh load, profile not yet fetched) must NOT land on /forbidden.
 * The guard awaits one refreshUser() before deciding; the profile fetch
 * itself is a network boundary (global fetch stub) — refreshUser is never
 * mocked, because calling it is the behaviour under test.
 */
describe('admin guard fresh-load race (N1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    persistSession(window.localStorage, {
      accessToken: 'test-token',
      tokenType: 'Bearer',
      email: 'ada@example.org',
    });
    useAuthStore().hydrate();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function stubProfile(isAdmin: boolean, status = 200): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/users/loggedInUser')) {
          return status === 200
            ? jsonResponse({ id: 'u1', name: 'ada', email: 'ada@example.org', isAdmin })
            : jsonResponse({ message: 'error' }, status);
        }
        return jsonResponse({}, 404);
      }),
    );
  }

  it('admits an admin directly loading unmapped /admin/settings on fresh load', async () => {
    stubProfile(true);
    await router.push('/admin/settings');
    expect(router.currentRoute.value.fullPath).toBe('/admin/settings');
    expect(useAuthStore().user?.isAdmin).toBe(true);
  });

  it('still forbids a non-admin directly loading unmapped /admin/roles on fresh load', async () => {
    stubProfile(false);
    await router.push('/admin/roles');
    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('fails closed when the fresh-load profile fetch fails', async () => {
    stubProfile(true, 500);
    await router.push('/admin/settings/audit-logs');
    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('redirects to login when there is no session at all', async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    await router.push('/admin/settings/system');
    expect(router.currentRoute.value.name).toBe('login');
  });
});
