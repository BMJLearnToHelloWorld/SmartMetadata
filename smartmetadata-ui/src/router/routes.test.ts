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
  addRuleLocation,
  editRuleLocation,
  policyDetailLocation,
  roleDetailLocation,
} from '@/views/admin/accessPaths';
import { membersTabGuard, resolveGuard } from './guards';
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
// B2-E5b (D1): '/explore' is now the canonical Explore path and
// '/search' its alias, so both resolve to 'search' here.
describe('official-path aliases (G-01…G-10)', () => {
  const cases: Array<[alias: string, name: string]> = [
    ['/explore', 'search'],
    ['/search', 'search'],
    ['/data-quality', 'quality-test-cases'],
    ['/data-quality/test-suites', 'quality-data-quality-tab'],
    ['/data-quality/test-cases', 'quality-data-quality-tab'],
    ['/data-quality/dashboard', 'quality-data-quality-tab'],
    ['/test-library', 'quality-test-definitions'],
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

  it('resolves the official dimension-results page', () => {
    const resolved = router.resolve('/test-case/some-case/dimensions/region');
    expect(resolved.name).toBe('quality-test-case-dimensions');
    expect(resolved.params).toMatchObject({ fqn: 'some-case', dimensionKey: 'region' });
  });

  it('redirects the product dimension path onto the official route', () => {
    const resolved = router.resolve('/quality/test-cases/some-case/dimensions/region/test-case-results');
    const record = resolved.matched[resolved.matched.length - 1];
    expect(record).toBeDefined();
    expect(typeof record.redirect).toBe('function');
    const target = (record.redirect as (to: typeof resolved) => { name: string; params: Record<string, unknown> })(
      resolved,
    );
    expect(target).toMatchObject({
      name: 'quality-test-case-dimensions',
      params: { fqn: 'some-case', dimensionKey: 'region', tab: 'test-case-results' },
    });
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
    // 'admin-teams' is deleted (sections batch): the bare teams path is
    // the settings-members-teams redirect record, whose target is the
    // Organization team detail (settings-members-team, fqn=Organization).
    ['/settings/members/teams', 'settings-members-teams'],
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
    ['/settings/notifications/alerts', 'settings-notification-alerts'],
    ['/settings/notifications/alerts/al1', 'settings-notification-alert'],
    ['/settings/notifications/announcements', 'announcements'],
    ['/settings/notifications/announcements/duplicate/a1', 'announcement-duplicate'],
    ['/settings/preferences/appearance', 'settings-preferences-appearance'],
    ['/settings/preferences/email', 'settings-preferences-email'],
    ['/settings/preferences/loginConfiguration', 'settings-preferences-login'],
    ['/settings/preferences/loginConfiguration/edit', 'settings-preferences-login-edit'],
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
      // 'admin-teams' is deleted; the replacement redirect record keeps
      // the teams-list name in the router (target: settings-members-team).
      'settings-members-teams',
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

  it('registers each policy-rule action pattern exactly once (M1a, R-14(a))', () => {
    const paths = router.getRoutes().map((route) => route.path);
    expect(paths.filter((path) => path === '/settings/access/policies/:fqn/add-rule')).toHaveLength(1);
    expect(
      paths.filter((path) => path === '/settings/access/policies/:fqn/edit-rule/:ruleName'),
    ).toHaveLength(1);
    expect(paths).not.toContain('/settings/access/policies/:id/add-rule');
    expect(paths).not.toContain('/settings/access/policies/:id/edit-rule/:ruleName');
  });

  it('registers the policy and role detail segments as :fqn (C-P6j)', () => {
    const paths = router.getRoutes().map((route) => route.path);
    expect(paths.filter((path) => path === '/settings/access/policies/:fqn')).toHaveLength(1);
    expect(paths.filter((path) => path === '/settings/access/roles/:fqn')).toHaveLength(1);
    expect(paths).not.toContain('/settings/access/policies/:id');
    expect(paths).not.toContain('/settings/access/roles/:id');
  });

  it('resolves the accessPaths locations against the real router (C-P6j)', () => {
    // Regression: accessPaths builds { fqn } params while the router
    // table declared :id, so resolving a policy/role link threw
    // "Missing required param id" and props:true never injected the
    // views' fqn prop. The view tests never caught it — they mount
    // against local test routers that were already :fqn.
    const policy = router.resolve(policyDetailLocation('Data Consumer'));
    expect(policy.name).toBe('admin-policy');
    expect(policy.params).toMatchObject({ fqn: 'Data Consumer' });
    const role = router.resolve(roleDetailLocation('DataConsumer'));
    expect(role.name).toBe('admin-role');
    expect(role.params).toMatchObject({ fqn: 'DataConsumer' });
    const addRule = router.resolve(addRuleLocation('Data Consumer'));
    expect(addRule.name).toBe('admin-policy-rule-add');
    expect(addRule.params).toMatchObject({ fqn: 'Data Consumer' });
    const editRule = router.resolve(editRuleLocation('Data Consumer', 'RuleA'));
    expect(editRule.name).toBe('admin-policy-rule-edit');
    expect(editRule.params).toMatchObject({ fqn: 'Data Consumer', ruleName: 'RuleA' });
    // And the resolved URL segments feed the views' fqn prop.
    expect(router.resolve('/settings/access/policies/Data%20Consumer').params).toMatchObject({
      fqn: 'Data Consumer',
    });
    expect(router.resolve('/settings/access/policies/Data%20Consumer/edit-rule/RuleA').params).toMatchObject({
      fqn: 'Data Consumer',
      ruleName: 'RuleA',
    });
  });

  it('drops the :tab segment from the workflow detail pattern (D-5)', () => {
    const record = router.getRoutes().find((route) => route.name === 'workflow-detail');
    expect(record?.path).toBe('/settings/governance/workflow-definitions/:fqn');
    expect(router.resolve('/settings/governance/workflow-definitions/w1/workflow').name).toBe(
      'not-found',
    );
  });

  it('resolves staged-retained records at their original URLs', () => {
    // B-9 (a1): the user detail segment is `:fqn` (the value is the username).
    expect(router.resolve('/admin/users/u1').name).toBe('admin-user');
    expect(router.resolve('/admin/users/u1').params).toMatchObject({ fqn: 'u1' });
    expect(router.resolve('/admin/bots/b1').name).toBe('admin-bot');
    expect(router.resolve('/connections').name).toBe('connections');
    expect(router.resolve('/ingestion/services').name).toBe('not-found');
    expect(router.resolve('/ingestion/services/database/s1').name).toBe('ingestion-service');
    // D-17: the official `/:serviceCategory/add-service` form; the
    // retained `/ingestion/services/add` path is deleted with it.
    expect(router.resolve('/databaseServices/add-service').name).toBe('ingestion-service-add');
    expect(router.resolve('/databaseServices/add-service').params).toMatchObject({
      serviceCategory: 'databaseServices',
    });
    expect(router.resolve('/all/add-service').name).toBe('ingestion-service-add');
    expect(router.resolve('/all/add-service').params).toMatchObject({ serviceCategory: 'all' });
    expect(router.resolve('/ingestion/services/add').name).toBe('not-found');
    // B-9: the domain detail segment is `:fqn`.
    expect(router.resolve('/governance/domains/Finance').name).toBe('governance-domain');
    expect(router.resolve('/governance/domains/Finance').params).toMatchObject({ fqn: 'Finance' });
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
    expect(resolved.params).toMatchObject({ fqn: 'admins' });
    const botResolved = router.resolve('/admin/bots/bots');
    expect(botResolved.name).toBe('admin-bot');
    expect(botResolved.params).toMatchObject({ id: 'bots' });
  });

  it('treats reserved literal URLs by dynamic matching, not as 404s (§4.4)', () => {
    // The create-user records are registered this stage (sections
    // faces), so the literal URLs resolve to them, not to the catch-all;
    // the role/policy literals still match the unconstrained detail
    // patterns and are handled as detail unknown-ids under the detail guard.
    const roleResolved = router.resolve('/settings/access/roles/add-role');
    expect(roleResolved.name).toBe('admin-role');
    expect(roleResolved.params).toMatchObject({ fqn: 'add-role' });
    const policyResolved = router.resolve('/settings/access/policies/add-policy');
    expect(policyResolved.name).toBe('admin-policy');
    expect(policyResolved.params).toMatchObject({ fqn: 'add-policy' });
    expect(router.resolve('/create-user').name).toBe('create-user');
    expect(router.resolve('/create-user/bot').name).toBe('create-user-bot');
  });
});

describe('guard declaration table (§10.2)', () => {
  function declarationOf(name: string): unknown {
    return router.getRoutes().find((route) => route.name === name)?.meta.guard;
  }

  it('declares none for the Hub, the category page and online users; SSO is undeclared', () => {
    expect(declarationOf('admin-settings')).toBe('none');
    expect(declarationOf('settings-category')).toBe('none');
    // admin-settings-sso carries no guard meta (sections verbatim,
    // binding rule). resolveGuard treats an undeclared route identically
    // to 'none' (both -> { kind: 'allow' }, session-only; guards.ts
    // resolveGuard), so the absence of a declaration IS the 'none'
    // behaviour here, asserted as undefined rather than 'none'.
    expect(declarationOf('admin-settings-sso')).toBeUndefined();
    expect(declarationOf('insights-online-users')).toBe('none');
  });

  it('declares view(resource) for the list/detail pairs', () => {
    const expected: Record<string, GuardDeclaration> = {
      'admin-users': { resource: 'USER', operation: 'view' },
      'admin-admins': { resource: 'USER', operation: 'view' },
      // 'admin-teams' is deleted; the teams detail record that carries
      // the TEAM view declaration is settings-members-team (the redirect
      // target for the bare teams path).
      'settings-members-team': { resource: 'TEAM', operation: 'view' },
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

  it('declares the create-user Create guards (R-1)', () => {
    expect(declarationOf('create-user')).toEqual({ resource: 'USER', operation: 'Create' });
    expect(declarationOf('create-user-bot')).toEqual({
      allOf: [
        { resource: 'USER', operation: 'Create' },
        { resource: 'BOT', operation: 'Create' },
      ],
    });
  });

  it('leaves the settings notification add/edit faces session-only (R-3)', () => {
    // Pin mounts the add/edit faces bare (SettingsRouter.tsx:575-607);
    // the page-level useAlertFormAccess gate is the only front-end
    // check, so no declaration is mounted here.
    expect(declarationOf('settings-notification-alert-add')).toBeUndefined();
    expect(declarationOf('settings-notification-alert-edit')).toBeUndefined();
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
      'settings-preferences-login-edit',
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

  it('marks the login-configuration routes with the provider gate', () => {
    for (const name of ['settings-preferences-login', 'settings-preferences-login-edit']) {
      const record = router.getRoutes().find((route) => route.name === name);
      expect(record?.meta.loginConfigGate).toBe(true);
    }
    const others = router
      .getRoutes()
      .filter((route) => route.meta.loginConfigGate === true)
      .map((route) => route.name);
    // getRoutes() orders by matcher score, not registration order, so
    // compare as a set.
    expect([...others].sort()).toEqual(['settings-preferences-login', 'settings-preferences-login-edit']);
  });

  it('declares the staged entry equivalence for the old user detail (M1b)', () => {
    expect(declarationOf('admin-user')).toEqual({ resource: 'USER', operation: 'entry' });
  });

  it('declares the three marketplace app routes admin-only (AP-D3 meta gate)', () => {
    // Officially each is wrapped in a bare AdminProtectedRoute; the
    // product equivalent is the 'admin-only' meta guard, and the views
    // carry no inline gate (DEL-22 HOLD lifted).
    for (const name of [
      'marketplace-app-catalog',
      'marketplace-app-detail',
      'marketplace-app-install',
    ]) {
      expect(declarationOf(name)).toBe('admin-only');
    }
    // The data marketplace overview stays unguarded, like the official
    // DataMarketplacePage route.
    expect(declarationOf('marketplace-overview')).toBeUndefined();
  });

  it('leaves the staged unit, the service family, inbox and column-bulk-ops undeclared', () => {
    for (const name of [
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
    // The plural alerts detail redirects to the official singular detail.
    ['/observability/alerts/a1', 'observability-alert', { fqn: 'a1', tab: 'configuration' }],
  ];
  it.each(redirectCases)('redirects %s to %s', (path, name, params) => {
    const resolved = resolveRedirect(path);
    expect(resolved.name).toBe(name);
    expect(resolved.params).toMatchObject(params);
  });

  it('sends the deleted redirect shapes to the catch-all', () => {
    // The govern/workflows/:fqn/:tab and workflows/:fqn/:tab redirect
    // records were deleted deliberately in the merge, and the bare
    // /announcements shapes never gained redirect records (their
    // canonical records live under /settings/notifications/...): all
    // four paths must 404 via the catch-all, not redirect.
    for (const path of [
      '/govern/workflows/w1/whatever',
      '/workflows/w1/whatever',
      '/announcements',
      '/announcements/duplicate/42',
    ]) {
      expect(router.resolve(path).name).toBe('not-found');
    }
  });

  const cases: Array<[path: string, name: string, params?: Record<string, string>]> = [
    // 02 members faces (pin SettingsRouter.tsx:672-714, 903-918).
    // The path resolves to the first-registered record, admin-team
    // (canonical manifest); settings-members-team is reached by name via
    // the /settings/members/teams redirect, asserted in redirectCases.
    ['/settings/members/teams/Eng', 'admin-team', { id: 'Eng' }],
    ['/settings/members/teams/Eng/import', 'settings-members-team-import', { fqn: 'Eng' }],
    // The static admin-users record wins over the :tab route for this path.
    ['/settings/members/users', 'admin-users', {}],
    // The static admin-admins record wins over the :tab route for this path.
    ['/settings/members/admins', 'admin-admins', {}],
    // The path is registered twice deliberately; the first record,
    // insights-online-users, wins path resolution.
    ['/settings/members/online-users', 'insights-online-users', {}],
    // The settings-bots record was dropped as a duplicate path of admin-bots.
    ['/settings/bots', 'admin-bots', {}],
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
    ['/settings/access/roles/r1', 'admin-role', { fqn: 'r1' }],
    ['/admin/policies/add', 'admin-policy-add', {}],
    ['/settings/access/policies/p1', 'admin-policy', { fqn: 'p1' }],
    ['/settings/access/policies/p1/add-rule', 'admin-policy-rule-add', { fqn: 'p1' }],
    ['/settings/access/policies/p1/edit-rule/r1', 'admin-policy-rule-edit', { fqn: 'p1', ruleName: 'r1' }],
    // 08 admin-app :fqn.
    ['/settings/apps/a1', 'admin-app', { fqn: 'a1' }],
    // 06 workflow detail without :tab (shell B-5); legacy shapes redirect.
    ['/settings/governance/workflow-definitions/w1', 'workflow-detail', { fqn: 'w1' }],
    // Same canonical record, distinct fqn so the case title stays unique.
    ['/settings/governance/workflow-definitions/w2', 'workflow-detail', { fqn: 'w2' }],
    // 07 notifications table (pin constants.ts:318-334).
    // Settings notification list/detail are a separate official face from
    // observability alerts.
    ['/settings/notifications/alerts', 'settings-notification-alerts', {}],
    ['/settings/notifications/alerts/a1', 'settings-notification-alert', { fqn: 'a1' }],
    ['/settings/notifications/alerts/a1/configuration', 'settings-notification-alert', { fqn: 'a1', tab: 'configuration' }],
    ['/observability/alerts', 'observability-alerts', {}],
    ['/observability/alert/a1/configuration', 'observability-alert', { fqn: 'a1', tab: 'configuration' }],
    ['/settings/notifications/add-notification', 'settings-notification-alert-add', {}],
    ['/settings/notifications/edit-notification/a1', 'settings-notification-alert-edit', { fqn: 'a1' }],
    // (The legacy /observability/alert(s) list/detail shapes are
    // asserted as 404s in the catch-all test below.)
    ['/observability/alerts/add', 'observability-alert-add', {}],
    ['/observability/alerts/edit/a1', 'observability-alert-edit', { fqn: 'a1' }],
    // The settings-notification-announcements record was dropped; HEAD's
    // canonical announcements record wins the path.
    ['/settings/notifications/announcements', 'announcements', {}],
    ['/settings/notifications/announcements/add', 'settings-notification-announcement-add', {}],
    ['/settings/notifications/announcements/edit/42', 'settings-notification-announcement-edit', { id: '42' }],
    // The settings-notification-announcement-duplicate record was dropped;
    // HEAD's canonical announcement-duplicate record wins the path.
    [
      '/settings/notifications/announcements/duplicate/42',
      'announcement-duplicate',
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

  it('resolves the four access detail routes by name with {fqn} (R-14(a))', () => {
    // Pin detail routes are `:fqn` and every location in
    // views/admin/accessPaths.ts navigates with {fqn}; before the
    // rename the named resolution could not satisfy the required `:id`
    // param and the path resolution delivered prop `id`, leaving the
    // views' `fqn` prop undefined (PolicyDetailView "No policy found").
    const cases: Array<[string, Record<string, string>, string]> = [
      ['admin-role', { fqn: 'r1' }, '/settings/access/roles/r1'],
      ['admin-policy', { fqn: 'p1' }, '/settings/access/policies/p1'],
      ['admin-policy-rule-add', { fqn: 'p1' }, '/settings/access/policies/p1/add-rule'],
      [
        'admin-policy-rule-edit',
        { fqn: 'p1', ruleName: 'rule1' },
        '/settings/access/policies/p1/edit-rule/rule1',
      ],
    ];
    for (const [name, params, path] of cases) {
      const resolved = router.resolve({ name, params });
      expect(resolved.name).toBe(name);
      expect(resolved.params).toMatchObject(params);
      expect(resolved.path).toBe(path);
    }
  });

  it('resolves official observability alert paths and classic redirects', () => {
    expect(router.resolve('/observability/alerts').name).toBe('observability-alerts');
    expect(router.resolve('/observability/alert').name).toBe('observability-alerts');
    expect(router.resolve('/observability/alert/a1').name).toBe('observability-alert');
    expect(router.resolve('/observability/alert/a1/recentEvents').name).toBe('observability-alert');
    expect(router.resolve('/settings/notifications/alerts/a1/diagnostic-info').name).toBe('settings-notification-alert');
    expect(router.resolve('/observability').redirectedFrom || router.resolve('/observability').path).toBeTruthy();
    expect(router.resolve('/test-library').name).toBe('quality-test-definitions');
    expect(router.getRoutes().find((route) => route.path === '/observability/test-library')?.redirect).toBe('/test-library');
    expect(router.getRoutes().find((route) => route.path === '/observability/incident-manager')?.redirect).toBe('/incident-manager');
    expect(router.resolve('/test-library').name).toBe('quality-test-definitions');
  });

  it('registers each new path exactly once', () => {
    const paths = router.getRoutes().map((route) => route.path);
    for (const path of [
      '/settings/members/teams',
      '/settings/members/teams/:fqn',
      '/settings/members/teams/:fqn/import',
      // '/settings/members/online-users' is intentionally registered
      // twice (insights-online-users + settings-members-online-users share
      // the path; first registration wins), so it is excluded here.
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
      // The sections :tab detail record was dropped; the surviving
      // redirect record for the legacy plural detail shape:
      '/observability/alerts/:id',
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

// AP-D3 hard cut (ADR:2026-11-20-ap-d3-marketplace-routes-hard-cut):
// /marketplace is the app catalog and /data-marketplace is the data
// marketplace overview — the pre-cut table had them the other way
// round, with the overview reached through an alias. Route names are
// unchanged; the old /marketplace/apps catalog path matches nothing
// and falls into the catch-all.
describe('marketplace routes (AP-D3 hard cut)', () => {
  it('registers the four marketplace records at their official paths', () => {
    const routes = router.getRoutes();
    const byName = (name: string) => routes.find((route) => route.name === name);
    expect(byName('marketplace-overview')?.path).toBe('/data-marketplace');
    expect(byName('marketplace-app-catalog')?.path).toBe('/marketplace');
    expect(byName('marketplace-app-detail')?.path).toBe('/marketplace/apps/:fqn');
    expect(byName('marketplace-app-install')?.path).toBe('/marketplace/apps/:fqn/install');
  });

  it('registers no alias on the marketplace overview record', () => {
    // getRoutes() flattens aliases into records sharing the route's
    // name, so a surviving alias would surface as a second
    // marketplace-overview record (and a second /data-marketplace path).
    const routes = router.getRoutes();
    expect(routes.filter((route) => route.name === 'marketplace-overview')).toHaveLength(1);
    expect(routes.filter((route) => route.path === '/data-marketplace')).toHaveLength(1);
  });

  it('sends the old /marketplace/apps catalog path to the catch-all', () => {
    expect(router.resolve('/marketplace/apps').name).toBe('not-found');
  });

  it('resolves the four marketplace paths to their route names', () => {
    expect(router.resolve('/data-marketplace').name).toBe('marketplace-overview');
    expect(router.resolve('/marketplace').name).toBe('marketplace-app-catalog');
    expect(router.resolve('/marketplace/apps/some-app').name).toBe('marketplace-app-detail');
    expect(router.resolve('/marketplace/apps/some-app/install').name).toBe(
      'marketplace-app-install',
    );
  });

  it('resolves a login redirect captured as /marketplace under its new meaning (T-20)', () => {
    // Migration list §5 T-20: a ?redirect=/marketplace captured inside
    // the cut window is carried verbatim by the guard and resolved
    // after login under the new meaning — the app catalog, not the
    // data marketplace, which now lives at /data-marketplace. (The
    // non-admin placeholder on the catalog is pinned by
    // MarketplaceAppCatalogView.test.ts, 'shows the forbidden view for
    // non-admins without fetching'.)
    expect(resolveGuard({ isPublic: false, hasSession: false, fullPath: '/marketplace' })).toEqual(
      {
        kind: 'login',
        redirect: '/marketplace',
      },
    );
    expect(router.resolve('/marketplace').name).toBe('marketplace-app-catalog');
    expect(router.resolve('/marketplace').name).not.toBe('marketplace-overview');
    expect(router.resolve('/data-marketplace').name).toBe('marketplace-overview');
  });
});

describe('official entity-detail path segments', () => {
  it('resolves entity, tab, profiler sub-tab, and test-case paths', () => {
    expect(router.resolve('/table/svc.db.schema.orders').name).toBe('asset');
    expect(router.resolve('/table/svc.db.schema.orders/schema').name).toBe('asset-tab');
    expect(router.resolve('/table/svc.db.schema.orders/profiler/data-quality').name).toBe('asset-subtab');
    expect(router.resolve('/table/svc.db.schema.orders/activity_feed/all').name).toBe('asset-subtab');
    expect(router.resolve('/test-case/suite.case/test-case-results').name).toBe('quality-test-case');
  });

  it('does not invent a compatibility redirect from /assets or query tabs', () => {
    expect(router.resolve('/assets/table/foo').name).toBe('not-found');
    expect(router.resolve('/query/some.query').name).toBe('not-found');
  });
});
