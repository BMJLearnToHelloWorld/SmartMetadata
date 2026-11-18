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
  CREATE_USER_GUARD_DECLARATIONS,
  evaluateGuardDeclaration,
  guardDeclarationOf,
  guardDeclarationResources,
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

describe('create-user guard contract (§10.6, reserved, no routes)', () => {
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
