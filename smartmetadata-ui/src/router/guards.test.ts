/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { isAdminPath, resolveAdminAccess, resolveGuard } from './guards';

describe('route guards', () => {
  it('keeps public routes open without a session', () => {
    expect(
      resolveGuard({ isPublic: true, hasSession: false, fullPath: '/login' }),
    ).toEqual({ kind: 'allow' });
  });

  it('redirects to login when there is no session', () => {
    expect(
      resolveGuard({ isPublic: false, hasSession: false, fullPath: '/my-data' }),
    ).toEqual({ kind: 'login', redirect: '/my-data' });
  });

  it('passes non-admin routes on session alone', () => {
    expect(
      resolveGuard({ isPublic: false, hasSession: true, fullPath: '/my-data' }),
    ).toEqual({ kind: 'allow' });
  });

  it('forbids admin routes when neither permission line passes', () => {
    expect(
      resolveGuard({ isPublic: false, hasSession: true, fullPath: '/admin/users' }),
    ).toEqual({ kind: 'forbidden' });
  });

  it('admits admin routes on the isAdminUser line alone', () => {
    expect(
      resolveGuard({ isPublic: false, hasSession: true, fullPath: '/admin/users', isAdminUser: true }),
    ).toEqual({ kind: 'allow' });
  });

  it('admits admin routes on the permission line alone', () => {
    expect(
      resolveGuard({ isPublic: false, hasSession: true, fullPath: '/admin/users', hasPermission: true }),
    ).toEqual({ kind: 'allow' });
  });

  it('matches the official AdminProtectedRoute dual line', () => {
    expect(resolveAdminAccess({})).toBe(false);
    expect(resolveAdminAccess({ isAdminUser: true })).toBe(true);
    expect(resolveAdminAccess({ hasPermission: true })).toBe(true);
    expect(resolveAdminAccess({ isAdminUser: false, hasPermission: false })).toBe(false);
  });

  it('recognizes admin paths by prefix only', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/users')).toBe(true);
    expect(isAdminPath('/administrator')).toBe(false);
    expect(isAdminPath('/my-data')).toBe(false);
  });
});
