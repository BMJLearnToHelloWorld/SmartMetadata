/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { router } from './index';
import { isAdminPath, resolveGuard } from './guards';

describe('data access request routes', () => {
  it('registers the list and create routes without colliding with task routes', () => {
    const routes = router.getRoutes();
    const list = routes.find((route) => route.name === 'data-access-requests');
    const create = routes.find((route) => route.name === 'data-access-request-new');
    expect(list?.path).toBe('/data-access-requests');
    expect(create?.path).toBe('/data-access-requests/new');
    expect(routes.find((route) => route.name === 'task')?.path).toBe('/tasks/:id');
    // Names are not unique in this router: alias records share their
    // route's name (e.g. the task-forms settings alias). Paths are not
    // globally unique either: getRoutes() flattens the tree, so the
    // AppShell parent '/' and its '' index child both surface as '/'.
    // That is standard Vue Router structure, not a duplicate registration.
    // So collision is asserted on the new paths only: each occurs once.
    const paths = routes.map((route) => route.path);
    expect(paths.filter((path) => path === '/data-access-requests').length).toBe(1);
    expect(paths.filter((path) => path === '/data-access-requests/new').length).toBe(1);
  });
});

// G-01…G-10 (visual comparison): the official paths are aliases of
// the product routes — each resolves to the product route's name and
// keeps the product path as the canonical one. The alias list follows
// the official pin's ROUTES constants, not the plan's route labels
// (see docs/decisions/2026-11-07-route-aliases-use-official-paths.md).
describe('official-path aliases (G-01…G-10)', () => {
  const cases: Array<[alias: string, name: string]> = [
    ['/explore', 'search'],
    ['/data-quality', 'quality-test-cases'],
    ['/data-quality/test-suites', 'quality-test-suites'],
    ['/test-suites/some-suite', 'quality-test-suite'],
    ['/domain', 'governance-domains'],
    ['/dataProduct', 'governance-data-products'],
    ['/glossary', 'governance-glossaries'],
    ['/tags', 'governance-classifications'],
    ['/settings', 'admin-settings'],
    ['/data-insights/data-assets', 'insights-data-assets'],
    ['/metrics', 'governance-metrics'],
  ];
  it.each(cases)('resolves %s to %s', (alias, name) => {
    expect(router.resolve(alias).name).toBe(name);
  });

  it('does not register the plan-invented paths as routes', () => {
    // /data-products, /domains and /data-products/products are not
    // official routes (the live official env 404s on them); they must
    // stay unmapped so a typo still lands on the 404 page.
    for (const path of ['/data-products', '/domains', '/data-products/products']) {
      expect(router.resolve(path).name).toBe('not-found');
    }
  });
});

describe('settings alias stays admin-gated', () => {
  it('recognises the /settings alias URL as an admin path', () => {
    expect(isAdminPath('/settings')).toBe(true);
    expect(isAdminPath('/settings/governance/intake-forms')).toBe(true);
  });

  it('denies a non-admin opening /settings', () => {
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings',
        isAdminUser: false,
        hasPermission: undefined,
      }),
    ).toEqual({ kind: 'forbidden' });
  });

  it('admits an admin opening /settings', () => {
    expect(
      resolveGuard({
        isPublic: false,
        hasSession: true,
        fullPath: '/settings',
        isAdminUser: true,
      }),
    ).toEqual({ kind: 'allow' });
  });
});
