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
import { ADMIN_ROUTE_RESOURCE, hasAdminEntryGrant, isAdminPath, membersTabGuard, resolveAdminAccess, resolveGuard } from './guards';

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

  it('recognizes the announcements management list as admin-only (B-7)', () => {
    expect(isAdminPath('/announcements')).toBe(true);
    expect(isAdminPath('/announcements/duplicate/abc')).toBe(true);
    // The home announcement rail is a read-only view on /my-data,
    // not an admin route, and stays open to any signed-in user.
    expect(isAdminPath('/my-data')).toBe(false);
  });

  it('forbids the announcements list for non-admins, admits admins', () => {
    expect(
      resolveGuard({ isPublic: false, hasSession: true, fullPath: '/announcements' }),
    ).toEqual({ kind: 'forbidden' });
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/announcements/duplicate/abc',
      }),
    ).toEqual({ kind: 'forbidden' });
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/announcements',
        isAdminUser: true,
      }),
    ).toEqual({ kind: 'allow' });
  });

  it('maps user/team admin routes to a permission resource', () => {
    expect(ADMIN_ROUTE_RESOURCE['admin-users']).toBe('user');
    expect(ADMIN_ROUTE_RESOURCE['admin-user']).toBe('user');
    expect(ADMIN_ROUTE_RESOURCE['admin-admins']).toBe('user');
    expect(ADMIN_ROUTE_RESOURCE['admin-team']).toBe('team');
    // Sections batch: the settings members faces share the user/team
    // mappings, and roles/policies map per 03 §12 (view-or-better
    // entry; operations gated in-view).
    expect(ADMIN_ROUTE_RESOURCE['settings-members']).toBe('user');
    expect(ADMIN_ROUTE_RESOURCE['settings-members-team']).toBe('team');
    expect(ADMIN_ROUTE_RESOURCE['settings-members-team-import']).toBe('team');
    expect(ADMIN_ROUTE_RESOURCE['admin-roles']).toBe('role');
    expect(ADMIN_ROUTE_RESOURCE['admin-role']).toBe('role');
    expect(ADMIN_ROUTE_RESOURCE['admin-policies']).toBe('policy');
    expect(ADMIN_ROUTE_RESOURCE['admin-policy']).toBe('policy');
    // C-1 (Bai 2026-11-18): the custom-properties 'type' mappings are
    // deleted; the per-type gate lives in the detail page.
    expect(ADMIN_ROUTE_RESOURCE['admin-settings-custom-property-type']).toBeUndefined();
    // The add-rule/add-role/add-policy routes stay unmapped: their
    // §12 declarations are Create/EditAll operations, inexpressible
    // in the view-or-better entry vocabulary, and their views carry
    // no in-view Create gate. Bots, personas, audit logs and the
    // debugger stay admin-only until their mappings are determined.
    expect(ADMIN_ROUTE_RESOURCE['admin-role-add']).toBeUndefined();
    expect(ADMIN_ROUTE_RESOURCE['admin-policy-add']).toBeUndefined();
    expect(ADMIN_ROUTE_RESOURCE['admin-policy-rule-add']).toBeUndefined();
    expect(ADMIN_ROUTE_RESOURCE['admin-policy-rule-edit']).toBeUndefined();
    expect(ADMIN_ROUTE_RESOURCE['admin-settings-audit-logs']).toBeUndefined();
    expect(ADMIN_ROUTE_RESOURCE['admin-settings-permission-debugger']).toBeUndefined();
  });

  it('admits only the users/admins members segments, resolving the rest to /404', () => {
    expect(membersTabGuard({ params: { tab: 'users' } })).toBe(true);
    expect(membersTabGuard({ params: { tab: 'admins' } })).toBe(true);
    expect(membersTabGuard({ params: { tab: 'teams' } })).toBe('/404');
    expect(membersTabGuard({ params: { tab: 'bogus' } })).toBe('/404');
    expect(membersTabGuard({ params: {} })).toBe('/404');
  });

  it('recognizes the ingestion pipeline routes as admin-only (P-17)', () => {
    // Official keeps only the Pipelines tab admin-only
    // (ServicesPage.tsx:147-165); the service routes admit viewers and
    // owners under their own view-permission behaviour, so they are not
    // admin paths.
    expect(isAdminPath('/ingestion/pipelines')).toBe(true);
    expect(isAdminPath('/ingestion/pipelines/p1')).toBe(true);
    expect(isAdminPath('/ingestion/pipelines/p1/edit')).toBe(true);
    expect(isAdminPath('/ingestion')).toBe(false);
    expect(isAdminPath('/ingestion/services')).toBe(false);
    expect(isAdminPath('/ingestion/services/database/s1')).toBe(false);
    expect(isAdminPath('/ingestionx')).toBe(false);
  });

  it('forbids ingestion routes for non-admins, admits admins (P-17)', () => {
    expect(
      resolveGuard({ isPublic: false, hasSession: true, fullPath: '/ingestion/pipelines' }),
    ).toEqual({ kind: 'forbidden' });
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/ingestion/pipelines',
        isAdminUser: true,
      }),
    ).toEqual({ kind: 'allow' });
  });

  it('admits mapped admin entry on any view-or-better grant', () => {
    expect(hasAdminEntryGrant({ ViewAll: true })).toBe(true);
    expect(hasAdminEntryGrant({ ViewBasic: true })).toBe(true);
    expect(hasAdminEntryGrant({ EditAll: true })).toBe(true);
    expect(hasAdminEntryGrant({ Create: true })).toBe(false);
    expect(hasAdminEntryGrant({})).toBe(false);
    expect(hasAdminEntryGrant(null)).toBe(false);
    expect(hasAdminEntryGrant(undefined)).toBe(false);
  });
});
