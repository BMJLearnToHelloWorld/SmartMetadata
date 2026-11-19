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
import { ROUTE_DOMAIN_GROUPS, domainForPath } from './domains';
import { resolveGuard } from './guards';

describe('router domain scheme and guards (Stage 1)', () => {
  it('maps representative paths to exactly one domain group', () => {
    const cases: Record<string, string> = {
      '/login': 'auth',
      '/my-data': 'home',
      '/search': 'discover',
      '/assets/table/foo': 'discover',
      '/insights': 'insights',
      '/lineage': 'lineage',
      '/admin/settings/system': 'admin',
      '/admin/users/u1': 'admin',
      '/settings': 'settings',
      '/settings/access/roles': 'settings',
      '/governance/glossaries': 'governance',
      '/govern/metrics': 'governance',
      '/marketplace': 'marketplace',
      '/data-marketplace': 'data-marketplace',
      '/context-center': 'context-center',
      '/quality/test-cases': 'quality',
      '/observability/incidents': 'observability',
      '/ingestion/services': 'ingestion',
      '/activity': 'collaboration',
      '/tasks': 'collaboration',
    };
    for (const [path, expected] of Object.entries(cases)) {
      expect(domainForPath(path)).toBe(expected);
    }
    // Retired prefixes map to null (ungrouped); null is not a 404
    // proof — it only means no domain group claims the path.
    expect(domainForPath('/forbidden')).toBeNull();
    expect(domainForPath('/announcements')).toBeNull();
    expect(domainForPath('/no-such-route')).toBeNull();
    // The user/bot top-level faces have no domain group yet: the Stage 2
    // split owns their grouping, and the table must not grow new structure
    // on top of the flat router (domains.ts). A /settings/* face is
    // claimed by the settings group via its /settings prefix, so the
    // teams face maps to 'settings', not null.
    expect(domainForPath('/settings/members/teams')).toBe('settings');
    expect(domainForPath('/users/alice')).toBeNull();
    expect(domainForPath('/bots/b1')).toBeNull();
    const allPrefixes = ROUTE_DOMAIN_GROUPS.flatMap((group) => group.prefixes);
    expect(new Set(allPrefixes).size).toBe(allPrefixes.length);
  });

  it('guards public routes, redirects without a session, and denies by declaration', () => {
    expect(resolveGuard({ isPublic: true, hasSession: false, fullPath: '/login' })).toEqual({ kind: 'allow' });
    expect(resolveGuard({ isPublic: false, hasSession: false, fullPath: '/settings' })).toEqual({
      kind: 'login',
      redirect: '/settings',
    });
    // P1 dual line, meta-driven: a session alone no longer passes a
    // declared route; the declaration — never the URL — decides.
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/access/roles',
        declaration: { resource: 'ROLE', operation: 'view' },
      }),
    ).toEqual({ kind: 'deny' });
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/access/roles',
        isAdminUser: true,
        declaration: { resource: 'ROLE', operation: 'view' },
      }),
    ).toEqual({ kind: 'allow' });
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings/access/roles',
        hasPermission: true,
        declaration: { resource: 'ROLE', operation: 'view' },
      }),
    ).toEqual({ kind: 'allow' });
  });
});
