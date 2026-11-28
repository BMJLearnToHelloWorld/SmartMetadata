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
import {
  ADMIN_ROUTE_RESOURCE,
  CREATE_USER_GUARD_DECLARATIONS,
  evaluateGuardDeclaration,
  guardDeclarationOf,
  guardDeclarationResources,
  hasAdminEntryGrant,
  isAdminPath,
  membersTabGuard,
  resolveAdminAccess,
  resolveGuard,
  type GuardDeclaration,
} from './guards';

describe('route guards (meta-driven, DESIGN §10)', () => {
  it('keeps public routes open without a session', () => {
    expect(resolveGuard({ isPublic: true, hasSession: false, fullPath: '/login' })).toEqual({
      kind: 'allow',
    });
  });

  it('redirects to login when there is no session', () => {
    expect(resolveGuard({ isPublic: false, hasSession: false, fullPath: '/my-data' })).toEqual({
      kind: 'login',
      redirect: '/my-data',
    });
  });

  it('passes undeclared routes on session alone', () => {
    expect(resolveGuard({ isPublic: false, hasSession: true, fullPath: '/my-data' })).toEqual({
      kind: 'allow',
    });
  });

  it('passes none-declared routes on session alone', () => {
    expect(
      resolveGuard({ isPublic: false, hasSession: true, fullPath: '/settings', declaration: 'none' }),
    ).toEqual({ kind: 'allow' });
  });

  it('denies admin-only routes in place when neither line passes', () => {
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/access/permission-debugger',
        declaration: 'admin-only',
      }),
    ).toEqual({ kind: 'deny' });
  });

  it('admits declared routes on the isAdminUser line alone', () => {
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/members/users',
        isAdminUser: true,
        declaration: { resource: 'USER', operation: 'view' },
      }),
    ).toEqual({ kind: 'allow' });
  });

  it('admits declared routes on the permission line alone', () => {
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/members/users',
        hasPermission: true,
        declaration: { resource: 'USER', operation: 'view' },
      }),
    ).toEqual({ kind: 'allow' });
  });

  it('matches the official AdminProtectedRoute dual line', () => {
    expect(resolveAdminAccess({})).toBe(false);
    expect(resolveAdminAccess({ isAdminUser: true })).toBe(true);
    expect(resolveAdminAccess({ hasPermission: true })).toBe(true);
    expect(resolveAdminAccess({ isAdminUser: false, hasPermission: false })).toBe(false);
  });

  it('never judges by URL path: a staged-looking path without a declaration is session-only', () => {
    // The prefix machinery is retired (§10.5). fullPath is only the
    // login redirect target; the declaration decides.
    expect(
      resolveGuard({ isPublic: false, hasSession: true, fullPath: '/admin/users' }),
    ).toEqual({ kind: 'allow' });
    expect(
      resolveGuard({ isPublic: false, hasSession: true, fullPath: '/admin/settings/system' }),
    ).toEqual({ kind: 'allow' });
    expect(
      resolveGuard({ isPublic: false, hasSession: false, fullPath: '/admin/settings/system' }),
    ).toEqual({ kind: 'login', redirect: '/admin/settings/system' });
  });

  it('sends the login-configuration route to not-found before the admin line (S1)', () => {
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/preferences/loginConfiguration',
        isAdminUser: true,
        declaration: 'admin-only',
        loginConfigApplicable: false,
      }),
    ).toEqual({ kind: 'not-found' });
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/preferences/loginConfiguration',
        isAdminUser: true,
        declaration: 'admin-only',
        loginConfigApplicable: true,
      }),
    ).toEqual({ kind: 'allow' });
  });

  it('lets an unlogged visitor reach login even when the provider gate would fail', () => {
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: false,
        fullPath: '/settings/preferences/loginConfiguration',
        declaration: 'admin-only',
        loginConfigApplicable: false,
      }),
    ).toEqual({ kind: 'login', redirect: '/settings/preferences/loginConfiguration' });
  });
});

describe('sections route contract (retained table + segment guard)', () => {
  // Tests from the sections batch. The table, segment guard, entry
  // helper and prefix classifier are retained (see guards.ts header
  // note); the three path-based resolveGuard cases at the end are
  // translated to the declaration vocabulary — the live resolveGuard
  // no longer judges by URL path (§10.5) — keeping the denied-in-place
  // outcome each case pins. The two 'admits admin routes on the
  // isAdminUser / permission line alone' cases are covered by the
  // declared-route cases in the main describe above.
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
    expect(isAdminPath('/service/databaseServices/pg.warehouse')).toBe(false);
    expect(isAdminPath('/ingestionx')).toBe(false);
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

  it('forbids admin routes when neither permission line passes', () => {
    // Translated from the path-based case: the admin-users route
    // carries { resource: 'USER', operation: 'view' }
    // (router/index.ts); a non-admin with no grant is denied in place.
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/members/users',
        declaration: { resource: 'USER', operation: 'view' },
      }),
    ).toEqual({ kind: 'deny' });
  });

  it('forbids the announcements list for non-admins, admits admins', () => {
    // Translated from the path-based case: the announcements route is
    // declared 'admin-only' (router/index.ts); denial renders the
    // placeholder in place.
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/notifications/announcements',
        declaration: 'admin-only',
      }),
    ).toEqual({ kind: 'deny' });
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/notifications/announcements/duplicate/abc',
        declaration: 'admin-only',
      }),
    ).toEqual({ kind: 'deny' });
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/notifications/announcements',
        isAdminUser: true,
        declaration: 'admin-only',
      }),
    ).toEqual({ kind: 'allow' });
  });

  it('forbids ingestion routes for non-admins, admits admins (P-17)', () => {
    // Translated from the path-based case: the pipeline detail route
    // is declared 'admin-only' (router/index.ts); the list route is
    // deleted (DESIGN §6.7 row 2).
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/ingestion/pipelines/p1',
        declaration: 'admin-only',
      }),
    ).toEqual({ kind: 'deny' });
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/ingestion/pipelines/p1',
        isAdminUser: true,
        declaration: 'admin-only',
      }),
    ).toEqual({ kind: 'allow' });
  });
});

describe('guard declaration evaluation', () => {
  it('evaluates view as ViewAll or ViewBasic', () => {
    const declaration: GuardDeclaration = { resource: 'ROLE', operation: 'view' };
    expect(evaluateGuardDeclaration(declaration, { role: { ViewAll: true } })).toBe(true);
    expect(evaluateGuardDeclaration(declaration, { role: { ViewBasic: true } })).toBe(true);
    expect(evaluateGuardDeclaration(declaration, { role: { EditAll: true } })).toBe(false);
    expect(evaluateGuardDeclaration(declaration, { role: {} })).toBe(false);
    expect(evaluateGuardDeclaration(declaration, { role: null })).toBe(false);
    expect(evaluateGuardDeclaration(declaration, {})).toBe(false);
  });

  it('evaluates the staged entry operation as view-or-better (M1b)', () => {
    const declaration: GuardDeclaration = { resource: 'USER', operation: 'entry' };
    expect(evaluateGuardDeclaration(declaration, { user: { ViewAll: true } })).toBe(true);
    expect(evaluateGuardDeclaration(declaration, { user: { ViewBasic: true } })).toBe(true);
    expect(evaluateGuardDeclaration(declaration, { user: { EditAll: true } })).toBe(true);
    expect(evaluateGuardDeclaration(declaration, { user: { Create: true } })).toBe(false);
    expect(evaluateGuardDeclaration(declaration, { user: {} })).toBe(false);
  });

  it('evaluates Create, EditAll and AuditLogs on their own operations', () => {
    expect(
      evaluateGuardDeclaration({ resource: 'POLICY', operation: 'EditAll' }, { policy: { EditAll: true } }),
    ).toBe(true);
    expect(
      evaluateGuardDeclaration({ resource: 'POLICY', operation: 'EditAll' }, { policy: { ViewAll: true } }),
    ).toBe(false);
    expect(
      evaluateGuardDeclaration(
        { resource: 'AUDIT_LOG', operation: 'AuditLogs' },
        { auditLog: { AuditLogs: true } },
      ),
    ).toBe(true);
    expect(
      evaluateGuardDeclaration(
        { resource: 'AUDIT_LOG', operation: 'AuditLogs' },
        { auditLog: { ViewAll: true } },
      ),
    ).toBe(false);
    expect(
      evaluateGuardDeclaration({ resource: 'USER', operation: 'Create' }, { user: { Create: true } }),
    ).toBe(true);
  });

  it('maps declarations to §11.3 resource keys for fetching', () => {
    expect(guardDeclarationResources({ resource: 'USER', operation: 'view' })).toEqual(['user']);
    expect(guardDeclarationResources({ resource: 'AUDIT_LOG', operation: 'AuditLogs' })).toEqual([
      'auditLog',
    ]);
    expect(guardDeclarationResources({ resource: 'EVENT_SUBSCRIPTION', operation: 'view' })).toEqual([
      'eventsubscription',
    ]);
    expect(guardDeclarationResources('admin-only')).toEqual([]);
    expect(guardDeclarationResources('none')).toEqual([]);
    expect(
      guardDeclarationResources(CREATE_USER_GUARD_DECLARATIONS['/create-user/bot']),
    ).toEqual(['user', 'bot']);
  });

  it('fails closed on malformed meta declarations', () => {
    expect(guardDeclarationOf(undefined)).toBeUndefined();
    expect(guardDeclarationOf('admin-only')).toBe('admin-only');
    expect(guardDeclarationOf('none')).toBe('none');
    expect(guardDeclarationOf({ resource: 'USER', operation: 'view' })).toEqual({
      resource: 'USER',
      operation: 'view',
    });
    expect(guardDeclarationOf({ resource: 'USER', operation: 'bogus' })).toBe('admin-only');
    expect(guardDeclarationOf({ resource: 'BOGUS', operation: 'view' })).toBe('admin-only');
    expect(guardDeclarationOf({ resource: 'USER' })).toBe('admin-only');
    expect(guardDeclarationOf('admin')).toBe('admin-only');
    expect(guardDeclarationOf({ allOf: [] })).toBe('admin-only');
    expect(
      guardDeclarationOf({
        allOf: [
          { resource: 'USER', operation: 'Create' },
          { resource: 'BOT', operation: 'Create' },
        ],
      }),
    ).toEqual({
      allOf: [
        { resource: 'USER', operation: 'Create' },
        { resource: 'BOT', operation: 'Create' },
      ],
    });
    expect(
      guardDeclarationOf({
        allOf: [{ resource: 'USER', operation: 'Create' }, { resource: 'BOT' }],
      }),
    ).toBe('admin-only');
  });
});

describe('create-user guard contract (§10.6, R-1: mounted on the routes)', () => {
  it('declares Create(user) for the plain branch', () => {
    expect(CREATE_USER_GUARD_DECLARATIONS['/create-user']).toEqual({
      resource: 'USER',
      operation: 'Create',
    });
  });

  it('requires the bot conjunction across all four permission combinations', () => {
    const declaration = CREATE_USER_GUARD_DECLARATIONS['/create-user/bot'];
    const ops = (userCreate: boolean, botCreate: boolean) => ({
      user: { Create: userCreate },
      bot: { Create: botCreate },
    });
    expect(evaluateGuardDeclaration(declaration, ops(true, true))).toBe(true);
    expect(evaluateGuardDeclaration(declaration, ops(true, false))).toBe(false);
    expect(evaluateGuardDeclaration(declaration, ops(false, true))).toBe(false);
    expect(evaluateGuardDeclaration(declaration, ops(false, false))).toBe(false);
    // The admin line stays outside the conjunction (§10.6 point 3).
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/create-user/bot',
        isAdminUser: true,
        hasPermission: false,
        declaration,
      }),
    ).toEqual({ kind: 'allow' });
  });
});
