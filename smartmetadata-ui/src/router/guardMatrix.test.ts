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
import { resetAuthProviderCache } from '@/settings/permissionRules';
import { useAuthStore } from '@/stores/auth';
import { useGuardDecisionStore } from '@/stores/guardDecision';
import { router } from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface StubOptions {
  isAdmin: boolean;
  grants?: Record<string, string[]>;
  provider?: string | null;
  authConfigStatus?: number;
}

function stubBackend(options: StubOptions, requestedUrls: string[]): void {
  const { isAdmin, grants = {}, provider = 'basic', authConfigStatus = 200 } = options;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('/api/v1/users/loggedInUser')) {
        return jsonResponse({ id: 'u1', name: 'ada', email: 'ada@example.org', isAdmin });
      }
      const permissionMatch = url.match(/\/api\/v1\/permissions\/([^/?]+)/);
      if (permissionMatch) {
        const resource = decodeURIComponent(permissionMatch[1]);
        return jsonResponse({
          resource,
          permissions: (grants[resource] ?? []).map((operation) => ({
            operation,
            access: 'allow',
          })),
        });
      }
      if (url.includes('/api/v1/system/config/auth')) {
        return authConfigStatus === 200
          ? jsonResponse(provider === null ? {} : { provider })
          : jsonResponse({ message: 'error' }, authConfigStatus);
      }
      return jsonResponse({}, 404);
    }),
  );
}

describe('guard matrix: three identities × final state (C-4 matrix 2)', () => {
  let requestedUrls: string[];

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    resetAuthProviderCache();
    requestedUrls = [];
    persistSession(window.localStorage, {
      accessToken: 'test-token',
      tokenType: 'Bearer',
      email: 'ada@example.org',
    });
    useAuthStore().hydrate();
    // Leave the previous test's route so every push below runs the guard.
    await router.push('/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    resetAuthProviderCache();
  });

  async function loginAsNonAdmin(grants: Record<string, string[]> = {}): Promise<void> {
    stubBackend({ isAdmin: false, grants }, requestedUrls);
  }

  async function loginAsAdmin(): Promise<void> {
    stubBackend({ isAdmin: true }, requestedUrls);
  }

  describe('top-level routes (final state)', () => {
    it('admits an admin to a declared route', async () => {
      await loginAsAdmin();
      await router.push('/settings/access/roles');
      expect(router.currentRoute.value.name).toBe('admin-roles');
      expect(router.currentRoute.value.fullPath).toBe('/settings/access/roles');
      expect(useGuardDecisionStore().isDeniedFor('/settings/access/roles', 'ada')).toBe(false);
    });

    it('admits a non-admin holding the view grant', async () => {
      await loginAsNonAdmin({ role: ['ViewAll'] });
      await router.push('/settings/access/roles');
      expect(router.currentRoute.value.name).toBe('admin-roles');
      expect(useGuardDecisionStore().isDeniedFor('/settings/access/roles', 'ada')).toBe(false);
    });

    it('denies a non-admin without the grant in place, URL unchanged', async () => {
      await loginAsNonAdmin();
      await router.push('/settings/access/roles');
      expect(router.currentRoute.value.name).toBe('admin-roles');
      expect(router.currentRoute.value.fullPath).toBe('/settings/access/roles');
      expect(useGuardDecisionStore().isDeniedFor('/settings/access/roles', 'ada')).toBe(true);
    });

    it('redirects an unlogged visitor to login', async () => {
      localStorage.clear();
      setActivePinia(createPinia());
      stubBackend({ isAdmin: false }, requestedUrls);
      await router.push('/settings/access/roles');
      expect(router.currentRoute.value.name).toBe('login');
      expect(router.currentRoute.value.query.redirect).toBe('/settings/access/roles');
    });

    it('admits a non-admin to a none route without querying permissions', async () => {
      await loginAsNonAdmin();
      await router.push('/settings');
      expect(router.currentRoute.value.name).toBe('admin-settings');
      expect(requestedUrls.some((url) => url.includes('/api/v1/permissions/'))).toBe(false);
    });

    it('never queries the permission API for admin-only routes', async () => {
      await loginAsNonAdmin();
      await router.push('/settings/access/permission-debugger');
      expect(router.currentRoute.value.name).toBe('admin-settings-permission-debugger');
      expect(useGuardDecisionStore().isDeniedFor('/settings/access/permission-debugger', 'ada')).toBe(
        true,
      );
      expect(requestedUrls.some((url) => url.includes('/api/v1/permissions/'))).toBe(false);
    });

    it('never queries the permission API once the admin line passes', async () => {
      await loginAsAdmin();
      await router.push('/settings/access/roles');
      expect(router.currentRoute.value.name).toBe('admin-roles');
      expect(requestedUrls.some((url) => url.includes('/api/v1/permissions/'))).toBe(false);
    });

    it('records the decision against the principal it was made for', async () => {
      await loginAsNonAdmin();
      await router.push('/settings/access/roles');
      expect(useGuardDecisionStore().decision).toMatchObject({
        fullPath: '/settings/access/roles',
        principalKey: 'ada',
        denied: true,
      });
    });

    it('replaces a denial with the next navigation decision', async () => {
      await loginAsNonAdmin();
      await router.push('/settings/access/roles');
      expect(useGuardDecisionStore().isDeniedFor('/settings/access/roles', 'ada')).toBe(true);
      await router.push('/settings');
      expect(useGuardDecisionStore().isDeniedFor('/settings/access/roles', 'ada')).toBe(false);
      expect(useGuardDecisionStore().decision).toMatchObject({ fullPath: '/settings', denied: false });
    });
  });

  describe('old URLs (C-4 matrix 2: logged-in → catch-all)', () => {
    it('sends a logged-in admin to not-found', async () => {
      await loginAsAdmin();
      await router.push('/admin/users');
      expect(router.currentRoute.value.name).toBe('not-found');
      await router.push('/admin/settings/persona/p1/customize/LandingPage');
      expect(router.currentRoute.value.name).toBe('not-found');
    });

    it('sends a logged-in non-admin to not-found, not to the placeholder', async () => {
      await loginAsNonAdmin();
      await router.push('/announcements');
      expect(router.currentRoute.value.name).toBe('not-found');
      expect(useGuardDecisionStore().isDeniedFor('/announcements', 'ada')).toBe(false);
      await router.push('/admin/settings/audit-logs');
      expect(router.currentRoute.value.name).toBe('not-found');
    });

    it('redirects an unlogged visitor to login', async () => {
      localStorage.clear();
      setActivePinia(createPinia());
      stubBackend({ isAdmin: false }, requestedUrls);
      await router.push('/admin/users');
      expect(router.currentRoute.value.name).toBe('login');
    });

    it('keeps the M1c literal URL on the staged detail pattern (never catch-all)', async () => {
      await loginAsAdmin();
      await router.push('/admin/users/admins');
      expect(router.currentRoute.value.name).toBe('admin-user');
      expect(router.currentRoute.value.params).toMatchObject({ id: 'admins' });
    });

    it('applies the staged entry rule to the M1c literal URL for non-admins', async () => {
      await loginAsNonAdmin({ user: ['ViewBasic'] });
      await router.push('/admin/users/admins');
      expect(router.currentRoute.value.name).toBe('admin-user');
      expect(useGuardDecisionStore().isDeniedFor('/admin/users/admins', 'ada')).toBe(false);
    });
  });

  describe('login-configuration provider gate (S1, before the admin line)', () => {
    it('sends an admin to not-found for an inapplicable provider', async () => {
      stubBackend({ isAdmin: true, provider: 'google' }, requestedUrls);
      await router.push('/settings/preferences/loginConfiguration');
      expect(router.currentRoute.value.name).toBe('not-found');
    });

    it('admits an admin for an applicable provider', async () => {
      stubBackend({ isAdmin: true, provider: 'ldap' }, requestedUrls);
      await router.push('/settings/preferences/loginConfiguration');
      expect(router.currentRoute.value.name).toBe('settings-preferences-login');
    });

    it('sends an admin to not-found when the provider is undefined', async () => {
      stubBackend({ isAdmin: true, provider: null }, requestedUrls);
      await router.push('/settings/preferences/loginConfiguration');
      expect(router.currentRoute.value.name).toBe('not-found');
    });

    it('sends an admin to not-found when the auth config fails to load', async () => {
      stubBackend({ isAdmin: true, authConfigStatus: 500 }, requestedUrls);
      await router.push('/settings/preferences/loginConfiguration');
      expect(router.currentRoute.value.name).toBe('not-found');
    });

    it('denies a non-admin in place (not 404) once the gate passes', async () => {
      stubBackend({ isAdmin: false, provider: 'basic' }, requestedUrls);
      await router.push('/settings/preferences/loginConfiguration');
      expect(router.currentRoute.value.name).toBe('settings-preferences-login');
      expect(
        useGuardDecisionStore().isDeniedFor('/settings/preferences/loginConfiguration', 'ada'),
      ).toBe(true);
    });

    it('does not apply the gate to the SSO route', async () => {
      stubBackend({ isAdmin: true, provider: 'google' }, requestedUrls);
      await router.push('/settings/sso');
      expect(router.currentRoute.value.name).toBe('admin-settings-sso');
    });
  });

  describe('staged rows', () => {
    it('admits an admin to System, denies a non-admin in place, redirects the unlogged', async () => {
      await loginAsAdmin();
      await router.push('/admin/settings/system');
      expect(router.currentRoute.value.name).toBe('admin-settings-system');
      expect(useGuardDecisionStore().isDeniedFor('/admin/settings/system', 'ada')).toBe(false);

      setActivePinia(createPinia());
      useAuthStore().hydrate();
      await router.push('/');
      stubBackend({ isAdmin: false }, requestedUrls);
      await router.push('/admin/settings/system');
      expect(router.currentRoute.value.name).toBe('admin-settings-system');
      expect(router.currentRoute.value.fullPath).toBe('/admin/settings/system');
      expect(useGuardDecisionStore().isDeniedFor('/admin/settings/system', 'ada')).toBe(true);

      localStorage.clear();
      setActivePinia(createPinia());
      await router.push('/');
      await router.push('/admin/settings/system');
      expect(router.currentRoute.value.name).toBe('login');
    });

    it('admits the old user detail on any entry grant, denies on Create alone', async () => {
      await loginAsNonAdmin({ user: ['ViewBasic'] });
      await router.push('/admin/users/u1');
      expect(router.currentRoute.value.name).toBe('admin-user');
      expect(useGuardDecisionStore().isDeniedFor('/admin/users/u1', 'ada')).toBe(false);

      setActivePinia(createPinia());
      useAuthStore().hydrate();
      await router.push('/');
      stubBackend({ isAdmin: false, grants: { user: ['Create'] } }, requestedUrls);
      await router.push('/admin/users/u1');
      expect(router.currentRoute.value.name).toBe('admin-user');
      expect(useGuardDecisionStore().isDeniedFor('/admin/users/u1', 'ada')).toBe(true);
    });

    it('keeps the old Bot detail admin-only', async () => {
      await loginAsNonAdmin({ bot: ['ViewAll'] });
      await router.push('/admin/bots/b1');
      expect(router.currentRoute.value.name).toBe('admin-bot');
      expect(useGuardDecisionStore().isDeniedFor('/admin/bots/b1', 'ada')).toBe(true);
      expect(requestedUrls.some((url) => url.includes('/api/v1/permissions/'))).toBe(false);
    });
  });
});
