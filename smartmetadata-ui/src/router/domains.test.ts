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
import { isAdminPath, resolveGuard } from './guards';

describe('router domain scheme and guards (Stage 1)', () => {
  it('maps representative paths to exactly one domain group', () => {
    const cases: Record<string, string> = {
      '/login': 'auth',
      '/forbidden': 'auth',
      '/my-data': 'home',
      '/search': 'discover',
      '/assets/table/foo': 'discover',
      '/insights': 'insights',
      '/lineage': 'lineage',
      '/admin/settings': 'admin',
      '/governance/glossaries': 'governance',
      '/govern/metrics': 'governance',
      '/marketplace': 'marketplace',
      '/context-center': 'context-center',
      '/quality/test-cases': 'quality',
      '/observability/incidents': 'observability',
      '/ingestion/services': 'ingestion',
      '/activity': 'collaboration',
      '/tasks': 'collaboration',
      '/announcements': 'collaboration',
    };
    for (const [path, expected] of Object.entries(cases)) {
      expect(domainForPath(path)).toBe(expected);
    }
    expect(domainForPath('/no-such-route')).toBeNull();
    const allPrefixes = ROUTE_DOMAIN_GROUPS.flatMap((group) => group.prefixes);
    expect(new Set(allPrefixes).size).toBe(allPrefixes.length);
  });

  it('guards public routes, redirects without a session, and detects admin paths', () => {
    expect(resolveGuard({ isPublic: true, hasSession: false, fullPath: '/login' })).toEqual({ kind: 'allow' });
    expect(resolveGuard({ isPublic: false, hasSession: false, fullPath: '/admin/settings' })).toEqual({
      kind: 'login',
      redirect: '/admin/settings',
    });
    expect(resolveGuard({ isPublic: false, hasSession: true, fullPath: '/admin/settings' })).toEqual({ kind: 'allow' });
    expect(isAdminPath('/admin/settings')).toBe(true);
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/administrator')).toBe(false);
    expect(isAdminPath('/search')).toBe(false);
  });
});
