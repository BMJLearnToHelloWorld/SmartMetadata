/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { membersTabGuard } from './guards';
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

// W2-2 (G-14 classic list): F-D-1 /incident-manager and F-D-4
// /test-case/:fqn(/:tab) aliases.
describe('incident-manager aliases (W2-2)', () => {
  const cases: Array<[alias: string, name: string]> = [
    ['/incident-manager', 'observability-incidents'],
    ['/test-case/some-case', 'quality-test-case'],
    ['/test-case/some-case/issues', 'quality-test-case'],
  ];
  it.each(cases)('resolves %s to %s', (alias, name) => {
    expect(router.resolve(alias).name).toBe(name);
  });

  it('maps the test-case alias params to the detail view props', () => {
    const resolved = router.resolve('/test-case/some-case/issues');
    expect(resolved.params).toMatchObject({ fqn: 'some-case', tab: 'issues' });
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

// Settings sections batch: the integration-wired faces. resolve()
// returns the matched record, not the redirect target, so redirect
// shapes assert through resolveRedirect below, which evaluates the
// record's own redirect declaration and resolves the result.
// resolve() does not run beforeEnter, so the members :tab rule is
// asserted by wiring identity here and by behaviour in guards.test.ts
// (membersTabGuard).
describe('settings sections faces', () => {
  function resolveRedirect(path: string) {
    const matched = router.resolve(path);
    const record = matched.matched[matched.matched.length - 1];
    expect(record?.redirect, `${path} must declare a redirect`).toBeDefined();
    const redirect = record?.redirect as
      | { name?: string; params?: Record<string, string> }
      | ((to: typeof matched) => { name?: string; params?: Record<string, string> })
      | undefined;
    const target = typeof redirect === 'function' ? redirect(matched) : redirect;
    return router.resolve(target as { name: string; params: Record<string, string> });
  }

  const redirectCases: Array<[path: string, name: string, params: Record<string, string>]> = [
    ['/settings/members/teams', 'settings-members-team', { fqn: 'Organization' }],
    ['/govern/workflows/w1/whatever', 'workflow-detail', { fqn: 'w1' }],
    ['/workflows/w1/whatever', 'workflow-detail', { fqn: 'w1' }],
    ['/observability/alerts/a1', 'observability-alert', { fqn: 'a1', tab: 'configuration' }],
    ['/announcements', 'settings-notification-announcements', {}],
    ['/announcements/duplicate/42', 'settings-notification-announcement-duplicate', { id: '42' }],
  ];
  it.each(redirectCases)('redirects %s to %s', (path, name, params) => {
    const resolved = resolveRedirect(path);
    expect(resolved.name).toBe(name);
    expect(resolved.params).toMatchObject(params);
  });

  const cases: Array<[path: string, name: string, params?: Record<string, string>]> = [
    // 02 members faces (pin SettingsRouter.tsx:672-714, 903-918).
    ['/settings/members/teams/Eng', 'settings-members-team', { fqn: 'Eng' }],
    ['/settings/members/teams/Eng/import', 'settings-members-team-import', { fqn: 'Eng' }],
    ['/settings/members/users', 'settings-members', { tab: 'users' }],
    ['/settings/members/admins', 'settings-members', { tab: 'admins' }],
    ['/settings/members/online-users', 'settings-members-online-users', {}],
    ['/settings/bots', 'settings-bots', {}],
    // 02/10 top-level faces (staged contract: old admin-* routes stay).
    ['/users/alice', 'user-detail', { fqn: 'alice' }],
    ['/users/alice/activity', 'user-detail', { fqn: 'alice', tab: 'activity' }],
    ['/users/alice/activity/all', 'user-detail', { fqn: 'alice', tab: 'activity', subTab: 'all' }],
    ['/users/registrationConfirmation', 'registration-confirmation', {}],
    ['/bots/b1', 'bot-detail', { fqn: 'b1' }],
    ['/create-user', 'create-user', {}],
    ['/create-user/bot', 'create-user-bot', {}],
    // 03 access faces: add routes + :fqn segments.
    ['/admin/roles/add', 'admin-role-add', {}],
    ['/admin/roles/r1', 'admin-role', { fqn: 'r1' }],
    ['/admin/policies/add', 'admin-policy-add', {}],
    ['/admin/policies/p1', 'admin-policy', { fqn: 'p1' }],
    ['/admin/policies/p1/rules/add', 'admin-policy-rule-add', { fqn: 'p1' }],
    ['/admin/policies/p1/rules/r1/edit', 'admin-policy-rule-edit', { fqn: 'p1', ruleName: 'r1' }],
    // 08 admin-app :fqn.
    ['/admin/apps/a1', 'admin-app', { fqn: 'a1' }],
    // 06 workflow detail without :tab (shell B-5); legacy shapes redirect.
    ['/govern/workflows/w1', 'workflow-detail', { fqn: 'w1' }],
    ['/workflows/w1', 'workflow-detail', { fqn: 'w1' }],
    // 07 notifications table (pin constants.ts:318-334).
    ['/settings/notifications/alerts', 'settings-notification-alerts', {}],
    ['/settings/notifications/alerts/a1', 'settings-notification-alert', { fqn: 'a1' }],
    [
      '/settings/notifications/alerts/a1/diagnostic-info',
      'settings-notification-alert',
      { fqn: 'a1', tab: 'diagnostic-info' },
    ],
    ['/settings/notifications/add-notification', 'settings-notification-alert-add', {}],
    ['/settings/notifications/edit-notification/a1', 'settings-notification-alert-edit', { fqn: 'a1' }],
    ['/observability/alerts', 'observability-alerts', {}],
    ['/observability/alert/a1', 'observability-alert', { fqn: 'a1' }],
    ['/observability/alert/a1/recentEvents', 'observability-alert', { fqn: 'a1', tab: 'recentEvents' }],
    ['/observability/alerts/add', 'observability-alert-add', {}],
    ['/observability/alerts/edit/a1', 'observability-alert-edit', { fqn: 'a1' }],
    ['/settings/notifications/announcements', 'settings-notification-announcements', {}],
    ['/settings/notifications/announcements/add', 'settings-notification-announcement-add', {}],
    ['/settings/notifications/announcements/edit/42', 'settings-notification-announcement-edit', { id: '42' }],
    [
      '/settings/notifications/announcements/duplicate/42',
      'settings-notification-announcement-duplicate',
      { id: '42' },
    ],
  ];
  it.each(cases)('resolves %s to %s', (path, name, params) => {
    const resolved = router.resolve(path);
    expect(resolved.name).toBe(name);
    if (params) {
      expect(resolved.params).toMatchObject(params);
    }
  });

  it('registers each new path exactly once', () => {
    const paths = router.getRoutes().map((route) => route.path);
    for (const path of [
      '/settings/members/teams',
      '/settings/members/teams/:fqn',
      '/settings/members/teams/:fqn/import',
      '/settings/members/online-users',
      '/settings/members/:tab',
      '/settings/bots',
      '/users/:fqn/:tab?/:subTab?',
      '/bots/:fqn',
      '/create-user',
      '/create-user/bot',
      '/admin/roles/add',
      '/admin/policies/add',
      '/settings/notifications/alerts',
      '/settings/notifications/add-notification',
      '/settings/notifications/edit-notification/:fqn',
      '/settings/notifications/alerts/:fqn/:tab?',
      '/settings/notifications/announcements',
      '/settings/notifications/announcements/add',
      '/settings/notifications/announcements/edit/:id',
      '/settings/notifications/announcements/duplicate/:id',
      '/observability/alert/:fqn/:tab?',
      '/observability/alerts/add',
      '/observability/alerts/edit/:fqn',
    ]) {
      expect(paths.filter((candidate) => candidate === path).length, path).toBe(1);
    }
  });

  it('wires the members :tab guard onto the :tab route', () => {
    const record = router.getRoutes().find((route) => route.name === 'settings-members');
    const guards = Array.isArray(record?.beforeEnter) ? record.beforeEnter : [record?.beforeEnter];
    expect(guards).toContain(membersTabGuard);
  });
});
