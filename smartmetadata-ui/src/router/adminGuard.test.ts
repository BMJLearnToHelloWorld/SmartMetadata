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
import { useGuardDecisionStore } from '@/stores/guardDecision';
import { router } from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * N1 regression, re-asserted under the meta-driven guard (DESIGN
 * §10.4 step 3): on a fresh load the guard awaits one refreshUser()
 * when the target carries a declaration, before deciding. A denial
 * is an in-place placeholder decision with the URL unchanged (D-3),
 * never a redirect to a forbidden route. The profile fetch itself
 * is a network boundary (global fetch stub) — refreshUser is never
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

  it('admits an admin directly loading the staged Persona route on fresh load', async () => {
    stubProfile(true);
    await router.push('/settings/persona');
    expect(router.currentRoute.value.fullPath).toBe('/settings/persona');
    expect(router.currentRoute.value.name).toBe('admin-settings-persona');
    expect(useAuthStore().user?.isAdmin).toBe(true);
    expect(useGuardDecisionStore().isDeniedFor('/settings/persona', 'ada')).toBe(false);
  });

  it('denies a non-admin in place, with the URL unchanged, on fresh load', async () => {
    stubProfile(false);
    await router.push('/settings/access/roles');
    expect(router.currentRoute.value.fullPath).toBe('/settings/access/roles');
    expect(router.currentRoute.value.name).toBe('admin-roles');
    expect(useGuardDecisionStore().isDeniedFor('/settings/access/roles', 'ada')).toBe(true);
  });

  it('fails closed when the fresh-load profile fetch fails', async () => {
    stubProfile(true, 500);
    await router.push('/settings/access/audit-logs');
    expect(router.currentRoute.value.fullPath).toBe('/settings/access/audit-logs');
    expect(router.currentRoute.value.name).toBe('admin-settings-audit-logs');
    expect(useGuardDecisionStore().isDeniedFor('/settings/access/audit-logs', null)).toBe(true);
  });

  it('redirects to login when there is no session at all', async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    // Move off any previous test's route first: pushing the same path
    // twice in a row is a no-op, so the guard would never re-run.
    await router.push('/');
    await router.push('/settings/access/roles');
    expect(router.currentRoute.value.name).toBe('login');
  });
});
