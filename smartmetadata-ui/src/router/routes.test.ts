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
import { router } from './index';
import type { GuardDeclaration } from './guards';

describe('data access request routes', () => {
  it('registers the list and create routes without colliding with task routes', () => {
    const routes = router.getRoutes();
    const list = routes.find((route) => route.name === 'data-access-requests');
    const create = routes.find((route) => route.name === 'data-access-request-new');
    expect(list?.path).toBe('/data-access-requests');
    expect(create?.path).toBe('/data-access-requests/new');
    expect(routes.find((route) => route.name === 'task')?.path).toBe('/tasks/:id');
    // Names are not unique in this router: alias records share their
    // route's name (e.g. the test-case aliases). Paths are not
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
// '/settings' is NOT an alias anymore: it is the canonical Hub path
// (D-1 hard cut, DESIGN §4.2); see the pattern manifest below.
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

// Route-pattern manifest (DESIGN §4.5 / §15.1). Classification key is
// (phase, pattern): canonical, staged-retained, deleted and reserved
// are asserted separately, and a deleted record is never asserted as
// an unreachable literal URL (M1c) — only URLs matched by no
// canonical or staged record fall into the catch-all.
describe('settings route-pattern manifest (§4.5)', () => {
  const canonical: Array<[path: string, name: string]> = [
    ['/settings', 'admin-settings'],
    ['/settings/members/users', 'admin-users'],
    ['/settings/members/admins', 'admin-admins'],
    ['/settings/members/teams', 'admin-teams'],
    ['/settings/members/teams/t1', 'admin-team'],
    ['/settings/members/online-users', 'insights-online-users'],
    ['/settings/access/roles', 'admin-roles'],
    ['/settings/access/roles/r1', 'admin-role'],
    ['/settings/access/policies', 'admin-policies'],
    ['/settings/access/policies/p1', 'admin-policy'],
    ['/settings/access/policies/p1/add-rule', 'admin-policy-rule-add'],
    ['/settings/access/policies/p1/edit-rule/rule1', 'admin-policy-rule-edit'],
    ['/settings/access/permission-debugger', 'admin-settings-permission-debugger'],
    ['/settings/access/audit-logs', 'admin-settings-audit-logs'],
    ['/settings/bots', 'admin-bots'],
    ['/settings/apps', 'admin-apps'],
    ['/settings/apps/a1', 'admin-app'],
    ['/settings/persona', 'admin-settings-persona'],
    ['/settings/persona/Analyst', 'admin-settings-persona-detail'],
    ['/settings/sso', 'admin-settings-sso'],
    ['/settings/notifications/alerts', 'observability-alerts'],
    ['/settings/notifications/alerts/al1', 'observability-alert'],
    ['/settings/notifications/announcements', 'announcements'],
    ['/settings/notifications/announcements/duplicate/a1', 'announcement-duplicate'],
    ['/settings/preferences/appearance', 'settings-preferences-appearance'],
    ['/settings/preferences/email', 'settings-preferences-email'],
    ['/settings/preferences/loginConfiguration', 'settings-preferences-login'],
    ['/settings/preferences/om-health', 'settings-preferences-health'],
    ['/settings/preferences/profiler-configuration', 'settings-preferences-profiler'],
    ['/settings/preferences/data-quality', 'settings-preferences-dq-dimensions'],
    ['/settings/preferences/search-settings', 'settings-preferences-search'],
    ['/settings/preferences/search-settings/table', 'settings-preferences-search-entity'],
    ['/settings/preferences/lineageConfig', 'settings-preferences-lineage'],
    ['/settings/preferences/om-url-config', 'settings-preferences-om-url'],
    ['/settings/preferences/dataAssetRules', 'settings-preferences-entity-rules'],
    ['/settings/preferences/learning-resources', 'settings-preferences-learning'],
    ['/settings/preferences/appMode', 'settings-preferences-app-mode'],
    ['/settings/preferences/glossary', 'settings-preferences-glossary'],
    ['/settings/preferences/timeFormat', 'settings-preferences-time-format'],
    ['/settings/customProperties/table', 'admin-settings-custom-property-type'],
    ['/settings/governance/workflow-definitions', 'workflows'],
    ['/settings/governance/workflow-definitions/w1', 'workflow-detail'],
    ['/settings/governance/intake-forms', 'admin-settings-governance-intake-forms'],
    ['/settings/governance/task-forms', 'admin-settings-governance-task-forms'],
    [
      '/settings/governance/glossary-term-relations',
      'admin-settings-governance-glossary-term-relations',
    ],
    ['/settings/services', 'settings-category'],
    ['/settings/customProperties', 'settings-category'],
  ];
  it.each(canonical)('canonical %s resolves to %s', (path, name) => {
    const resolved = router.resolve(path);
    expect(resolved.name).toBe(name);
  });

  it('registers the Hub as the single canonical /settings record, with no alias', () => {
    const records = router.getRoutes().filter((route) => route.name === 'admin-settings');
    expect(records).toHaveLength(1);
    expect(records[0].path).toBe('/settings');
    expect(records[0].aliasOf).toBeUndefined();
  });

  it('keeps route names unchanged across the migration (D-2)', () => {
    const names = new Set(router.getRoutes().map((route) => route.name));
    for (const name of [
      'admin-users',
      'admin-admins',
      'admin-teams',
      'admin-roles',
      'admin-policies',
      'admin-settings-persona',
      'settings-preferences-login',
      'observability-alerts',
      'workflows',
      'workflow-detail',
    ]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it('registers each policy-rule action pattern exactly once (M1a)', () => {
    const paths = router.getRoutes().map((route) => route.path);
    expect(paths.filter((path) => path === '/settings/access/policies/:id/add-rule')).toHaveLength(1);
    expect(
      paths.filter((path) => path === '/settings/access/policies/:id/edit-rule/:ruleName'),
    ).toHaveLength(1);
    expect(paths).not.toContain('/settings/access/policies/:fqn/add-rule');
    expect(paths).not.toContain('/settings/access/policies/:fqn/edit-rule/:ruleName');
  });

  it('drops the :tab segment from the workflow detail pattern (D-5)', () => {
    const record = router.getRoutes().find((route) => route.name === 'workflow-detail');
    expect(record?.path).toBe('/settings/governance/workflow-definitions/:fqn');
    expect(router.resolve('/settings/governance/workflow-definitions/w1/workflow').name).toBe(
      'not-found',
    );
  });

  it('resolves staged-retained records at their original URLs', () => {
    expect(router.resolve('/admin/settings/system').name).toBe('admin-settings-system');
    expect(router.resolve('/admin/users/u1').name).toBe('admin-user');
    expect(router.resolve('/admin/users/u1').params).toMatchObject({ id: 'u1' });
    expect(router.resolve('/admin/bots/b1').name).toBe('admin-bot');
    expect(router.resolve('/ingestion/services').name).toBe('ingestion-services');
    expect(router.resolve('/ingestion/services/database/s1').name).toBe('ingestion-service');
    expect(router.resolve('/ingestion/services/add').name).toBe('ingestion-service-add');
    expect(router.resolve('/ingestion/pipelines/p1').name).toBe('ingestion-pipeline');
    expect(router.resolve('/ingestion/pipelines/p1/edit').name).toBe('ingestion-pipeline-edit');
    expect(router.resolve('/inbox').name).toBe('inbox');
    expect(router.resolve('/customize-page/fqn/LandingPage').name).toBe('customize-page');
    expect(router.resolve('/settings/services/database').name).toBe('settings-services');
    expect(router.resolve('/settings/services/database').params.tab).toBe('database');
    expect(router.resolve('/govern/column-bulk-ops').name).toBe('column-bulk-ops');
    expect(router.resolve('/column-bulk-operations').name).toBe('column-bulk-ops');
  });

  it('deletes the old settings records, the aliases and the forbidden route', () => {
    const names = new Set(router.getRoutes().map((route) => route.name));
    expect(names.has('admin-settings-persona-customize')).toBe(false);
    expect(names.has('ingestion-pipelines')).toBe(false);
    expect(names.has('admin-settings-custom-properties')).toBe(false);
    expect(names.has('forbidden')).toBe(false);
    // settings-services exists (S-HUB registered it); its resolve
    // shape is asserted in the route-resolution test below.
    const paths = router.getRoutes().map((route) => route.path);
    expect(paths).not.toContain('/admin/settings');
    expect(paths).not.toContain('/admin/users');
    expect(paths).not.toContain('/admin/roles');
    expect(paths).not.toContain('/admin/policies/:id/rules/add');
    expect(paths).not.toContain('/govern/workflows');
    expect(paths).not.toContain('/announcements');
    expect(paths).not.toContain('/forbidden');
  });

  it('sends unclaimed old literal URLs to the catch-all', () => {
    for (const path of [
      '/admin/settings',
      '/admin/users',
      '/admin/roles',
      '/admin/policies',
      '/admin/bots',
      '/admin/apps',
      '/admin/teams',
      '/admin/settings/persona',
      '/admin/settings/sso',
      '/admin/settings/audit-logs',
      '/admin/settings/custom-properties',
      '/admin/settings/persona/p1/customize/LandingPage',
      '/admin/settings/persona/p1/customize/LandingPage/Table',
      '/announcements',
      '/announcements/duplicate/a1',
      '/observability/alerts',
      '/govern/workflows',
      '/govern/workflows/w1/workflow',
      '/workflows',
      '/workflows/w1/workflow',
      '/ingestion/pipelines',
      '/insights/online-users',
      '/forbidden',
    ]) {
      expect(router.resolve(path).name).toBe('not-found');
    }
  });

  it('distinguishes record deletion from literal-URL matching (M1c)', () => {
    // The old Admins list record is deleted, but the literal URL is
    // still matched by the staged detail pattern — never assert it
    // falls into the catch-all.
    const resolved = router.resolve('/admin/users/admins');
    expect(resolved.name).toBe('admin-user');
    expect(resolved.params).toMatchObject({ id: 'admins' });
    const botResolved = router.resolve('/admin/bots/bots');
    expect(botResolved.name).toBe('admin-bot');
    expect(botResolved.params).toMatchObject({ id: 'bots' });
  });

  it('treats reserved literal URLs by dynamic matching, not as 404s (§4.4)', () => {
    // No dedicated create records are registered this stage; the
    // literal URLs match the unconstrained detail patterns and are
    // handled as detail unknown-ids under the detail guard.
    const roleResolved = router.resolve('/settings/access/roles/add-role');
    expect(roleResolved.name).toBe('admin-role');
    expect(roleResolved.params).toMatchObject({ id: 'add-role' });
    const policyResolved = router.resolve('/settings/access/policies/add-policy');
    expect(policyResolved.name).toBe('admin-policy');
    expect(policyResolved.params).toMatchObject({ id: 'add-policy' });
    expect(router.resolve('/create-user').name).toBe('not-found');
    expect(router.resolve('/create-user/bot').name).toBe('not-found');
  });
});

describe('guard declaration table (§10.2)', () => {
  function declarationOf(name: string): unknown {
    return router.getRoutes().find((route) => route.name === name)?.meta.guard;
  }

  it('declares none for the Hub, the category page, SSO and online users', () => {
    expect(declarationOf('admin-settings')).toBe('none');
    expect(declarationOf('settings-category')).toBe('none');
    expect(declarationOf('admin-settings-sso')).toBe('none');
    expect(declarationOf('insights-online-users')).toBe('none');
  });

  it('declares view(resource) for the list/detail pairs', () => {
    const expected: Record<string, GuardDeclaration> = {
      'admin-users': { resource: 'USER', operation: 'view' },
      'admin-admins': { resource: 'USER', operation: 'view' },
      'admin-teams': { resource: 'TEAM', operation: 'view' },
      'admin-team': { resource: 'TEAM', operation: 'view' },
      'admin-roles': { resource: 'ROLE', operation: 'view' },
      'admin-role': { resource: 'ROLE', operation: 'view' },
      'admin-policies': { resource: 'POLICY', operation: 'view' },
      'admin-policy': { resource: 'POLICY', operation: 'view' },
      'admin-bots': { resource: 'BOT', operation: 'view' },
      'admin-apps': { resource: 'APPLICATION', operation: 'view' },
      'admin-app': { resource: 'APPLICATION', operation: 'view' },
      'observability-alerts': { resource: 'EVENT_SUBSCRIPTION', operation: 'view' },
      'observability-alert': { resource: 'EVENT_SUBSCRIPTION', operation: 'view' },
    };
    for (const [name, declaration] of Object.entries(expected)) {
      expect(declarationOf(name)).toEqual(declaration);
    }
  });

  it('declares EditAll(POLICY) for the policy-rule actions', () => {
    expect(declarationOf('admin-policy-rule-add')).toEqual({ resource: 'POLICY', operation: 'EditAll' });
    expect(declarationOf('admin-policy-rule-edit')).toEqual({
      resource: 'POLICY',
      operation: 'EditAll',
    });
  });

  it('declares AuditLogs(AUDIT_LOG) for audit logs', () => {
    expect(declarationOf('admin-settings-audit-logs')).toEqual({
      resource: 'AUDIT_LOG',
      operation: 'AuditLogs',
    });
  });

  it('declares admin-only for the admin-only surfaces', () => {
    for (const name of [
      'admin-settings-permission-debugger',
      'admin-settings-persona',
      'admin-settings-persona-detail',
      'announcements',
      'announcement-duplicate',
      'admin-settings-custom-property-type',
      'workflows',
      'workflow-detail',
      'admin-settings-governance-intake-forms',
      'admin-settings-governance-task-forms',
      'admin-settings-governance-glossary-term-relations',
      'customize-page',
      'ingestion-pipeline',
      'ingestion-pipeline-edit',
      'admin-settings-system',
      'admin-bot',
    ]) {
      expect(declarationOf(name)).toBe('admin-only');
    }
  });

  it('declares admin-only for every preferences page', () => {
    for (const name of [
      'settings-preferences-appearance',
      'settings-preferences-email',
      'settings-preferences-login',
      'settings-preferences-health',
      'settings-preferences-profiler',
      'settings-preferences-dq-dimensions',
      'settings-preferences-search',
      'settings-preferences-search-entity',
      'settings-preferences-lineage',
      'settings-preferences-om-url',
      'settings-preferences-entity-rules',
      'settings-preferences-learning',
      'settings-preferences-app-mode',
      'settings-preferences-glossary',
      'settings-preferences-time-format',
    ]) {
      expect(declarationOf(name)).toBe('admin-only');
    }
  });

  it('marks the login-configuration route with the provider gate', () => {
    const record = router.getRoutes().find((route) => route.name === 'settings-preferences-login');
    expect(record?.meta.loginConfigGate).toBe(true);
    const others = router
      .getRoutes()
      .filter((route) => route.meta.loginConfigGate === true)
      .map((route) => route.name);
    expect(others).toEqual(['settings-preferences-login']);
  });

  it('declares the staged entry equivalence for the old user detail (M1b)', () => {
    expect(declarationOf('admin-user')).toEqual({ resource: 'USER', operation: 'entry' });
  });

  it('leaves the staged unit, the service family, inbox and column-bulk-ops undeclared', () => {
    for (const name of [
      'ingestion-services',
      'ingestion-service',
      'ingestion-service-add',
      'ingestion-service-connection',
      'ingestion-service-add-ingestion',
      'ingestion-service-version',
      'inbox',
      'column-bulk-ops',
      'not-found',
    ]) {
      expect(declarationOf(name)).toBeUndefined();
    }
  });
});
