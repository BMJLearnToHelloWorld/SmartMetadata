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
import type { OperationPermissions } from '@/api/permissions';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { navIcon } from '@/layouts/navIcons';
import {
  SETTINGS_BREADCRUMB_NAMES,
  SETTINGS_REGISTRY,
  defaultSettingsPathForKey,
  findSettingsRegistryItem,
  flattenSettingsRegistry,
  registryDescription,
  registryTitle,
  resolveSettingsNavigation,
  searchSettingsEntityForSegment,
  searchSettingsSegmentForEntity,
  settingsBreadcrumbName,
  settingsKeySegment,
  settingsKeySegments,
  sortSettingsItemsByRenderedTitle,
  type SettingsPermissionRule,
  type SettingsRegistryItem,
} from './registry';
import {
  RESOURCE_KEY_BY_ENTITY,
  evaluatePermissionRule,
  filterVisibleSettingsItems,
  type PermissionRuleContext,
  type ResourceEntityName,
} from './permissionRules';

type Catalog = Record<string, unknown>;

function lookup(catalog: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        acc !== null && typeof acc === 'object'
          ? (acc as Catalog)[part]
          : undefined,
      catalog,
    );
}

function makeTranslator(catalog: unknown) {
  return (key: string, params?: Record<string, string>): string => {
    const value = lookup(catalog, key);
    if (typeof value !== 'string') {
      throw new Error(`missing locale string for ${key}`);
    }
    return value.replace(/\{(\w+)\}/g, (_match, name: string) => params?.[name] ?? `{${name}}`);
  };
}

const enT = makeTranslator(enUS);
const zhT = makeTranslator(zhCN);

function childKeys(entry: SettingsRegistryItem): string[] {
  return (entry.items ?? []).map((child) => child.key);
}

/**
 * A live-evaluator context over fake permission payloads: the named
 * resources grant ViewAll, the audit-log resource grants AuditLogs
 * iff requested, everything else grants nothing (fail-closed).
 */
function liveContext(
  overrides: {
    isAdminUser?: boolean;
    authProvider?: string | null;
    viewResources?: readonly ResourceEntityName[];
    auditLogs?: boolean;
  } = {},
): PermissionRuleContext {
  const viewKeys: Set<string> = new Set(
    (overrides.viewResources ?? []).map(
      (resource) => RESOURCE_KEY_BY_ENTITY[resource],
    ),
  );
  return {
    isAdminUser: overrides.isAdminUser ?? false,
    authProvider: overrides.authProvider,
    getResourceOps: async (resourceKey): Promise<OperationPermissions> => {
      if (resourceKey === RESOURCE_KEY_BY_ENTITY.AUDIT_LOG) {
        return { AuditLogs: overrides.auditLogs ?? false };
      }
      return viewKeys.has(resourceKey) ? { ViewAll: true } : {};
    },
  };
}

describe('settings registry (§3)', () => {
  it('lists the 11 categories in pin order', () => {
    expect(SETTINGS_REGISTRY.map((entry) => entry.key)).toEqual([
      'services',
      'apps',
      'notifications',
      'members',
      'access',
      'preferences',
      'customProperties',
      'bots',
      'persona',
      'sso',
      'governance',
    ]);
  });

  it('carries the §3.3 item sets in pin authored order', () => {
    const byKey = new Map(SETTINGS_REGISTRY.map((entry) => [entry.key, entry]));
    expect(childKeys(byKey.get('services')!)).toEqual([
      'services.apiServices',
      'services.databases',
      'services.messaging',
      'services.dashboards',
      'services.pipelines',
      'services.mlmodels',
      'services.storages',
      'services.search',
      'services.metadata',
      'services.drives',
      'services.dataObservability',
    ]);
    expect(childKeys(byKey.get('notifications')!)).toEqual([
      'notifications.alerts',
      'notifications.announcements',
    ]);
    expect(childKeys(byKey.get('members')!)).toEqual([
      'members.teams',
      'members.users',
      'members.admins',
      'members.online-users',
    ]);
    expect(childKeys(byKey.get('access')!)).toEqual([
      'access.roles',
      'access.policies',
      'access.permission-debugger',
      'access.audit-logs',
    ]);
    expect(childKeys(byKey.get('preferences')!)).toEqual([
      'preferences.appearance',
      'preferences.email',
      'preferences.loginConfiguration',
      'preferences.om-health',
      'preferences.profiler-configuration',
      'preferences.data-quality',
      'preferences.search-settings',
      'preferences.lineageConfig',
      'preferences.om-url-config',
      'preferences.dataAssetRules',
      'preferences.learning-resources',
      'preferences.appMode',
      'preferences.glossary',
      'preferences.timeFormat',
    ]);
    expect(childKeys(byKey.get('customProperties')!)).toEqual([
      'customProperties.apiCollections',
      'customProperties.apiEndpoints',
      'customProperties.dataProducts',
      'customProperties.dashboardDataModels',
      'customProperties.databases',
      'customProperties.databaseSchemas',
      'customProperties.metrics',
      'customProperties.tables',
      'customProperties.storedProcedures',
      'customProperties.dashboards',
      'customProperties.pipelines',
      'customProperties.topics',
      'customProperties.containers',
      'customProperties.mlmodels',
      'customProperties.searchIndexes',
      'customProperties.column',
      'customProperties.glossaryTerm',
      'customProperties.domains',
      'customProperties.charts',
      'customProperties.directories',
      'customProperties.files',
      'customProperties.spreadsheets',
      'customProperties.worksheets',
      'customProperties.articles',
      'customProperties.teams',
      'customProperties.users',
    ]);
    expect(childKeys(byKey.get('governance')!)).toEqual([
      'governance.glossary-term-relations',
      'governance.workflow-definitions',
      'governance.intake-forms',
    ]);
    // Single-card categories have no children (Hub click goes straight to the page).
    for (const key of ['apps', 'bots', 'persona', 'sso']) {
      expect(byKey.get(key)?.items, key).toBeUndefined();
    }
  });

  it('carries the 23 search-settings nested items (§3.4)', () => {
    const searchSettings = findSettingsRegistryItem('preferences.search-settings');
    expect(searchSettings?.sortByLabel).toBe(true);
    expect(childKeys(searchSettings!)).toEqual([
      'preferences.search-settings.tables',
      'preferences.search-settings.dashboards',
      'preferences.search-settings.pipelines',
      'preferences.search-settings.topics',
      'preferences.search-settings.glossaryTerm',
      'preferences.search-settings.apiEndpoints',
      'preferences.search-settings.dashboardDataModels',
      'preferences.search-settings.storedProcedures',
      'preferences.search-settings.containers',
      'preferences.search-settings.mlmodels',
      'preferences.search-settings.dataProducts',
      'preferences.search-settings.query',
      'preferences.search-settings.tags',
      'preferences.search-settings.databases',
      'preferences.search-settings.databaseSchemas',
      'preferences.search-settings.domains',
      'preferences.search-settings.metrics',
      'preferences.search-settings.searchIndexes',
      'preferences.search-settings.directories',
      'preferences.search-settings.files',
      'preferences.search-settings.spreadsheets',
      'preferences.search-settings.worksheets',
      'preferences.search-settings.column',
    ]);
  });

  it('holds 98 entries in total and no out-of-scope keys', () => {
    const all = flattenSettingsRegistry();
    expect(all).toHaveLength(98);
    expect(new Set(all.map((entry) => entry.key)).size).toBe(98);
    const keys = all.map((entry) => entry.key);
    expect(keys).not.toEqual(expect.arrayContaining(['search']));
    for (const banned of ['security', 'inbox', 'task-forms', 'system', 'glossaries']) {
      expect(keys.some((key) => key.includes(banned)), banned).toBe(false);
    }
  });

  it('derives segments from keys and stores no segment or route name (§3.1)', () => {
    for (const entry of flattenSettingsRegistry()) {
      expect(Object.keys(entry)).not.toContain('segment');
      expect(Object.keys(entry)).not.toContain('routeName');
      expect(settingsKeySegments(entry.key)).toEqual(entry.key.split('.'));
      expect(settingsKeySegment(entry.key)).toBe(entry.key.split('.').pop());
      expect(entry.target ? Object.keys(entry.target) : []).not.toContain('routeName');
    }
    expect(settingsKeySegments('preferences.search-settings.tables')).toEqual([
      'preferences',
      'search-settings',
      'tables',
    ]);
  });

  it('marks sortByLabel only on the two pin-sorted containers', () => {
    const sorted = flattenSettingsRegistry().filter((entry) => entry.sortByLabel);
    expect(sorted.map((entry) => entry.key)).toEqual([
      'preferences.search-settings',
      'customProperties',
    ]);
  });

  it('marks Beta only on Data Asset Rules and iconColor only on the four pin items', () => {
    const beta = flattenSettingsRegistry().filter((entry) => entry.isBeta);
    expect(beta.map((entry) => entry.key)).toEqual(['preferences.dataAssetRules']);
    const colored = flattenSettingsRegistry().filter((entry) => entry.iconColor);
    expect(colored.map((entry) => `${entry.key}:${entry.iconColor}`)).toEqual([
      'preferences.appMode:blue',
      'preferences.glossary:blue',
      'preferences.timeFormat:blue',
      'customProperties.articles:green',
    ]);
  });

  it('resolves every iconKey through navIcons (§13)', () => {
    for (const entry of flattenSettingsRegistry()) {
      expect(navIcon(entry.iconKey), `${entry.key} -> ${entry.iconKey}`).toBeTruthy();
    }
  });

  it('assigns the pin permission rule to every entry (§3.3, §11.1)', () => {
    const expected: Record<string, SettingsPermissionRule | undefined> = {
      services: undefined,
      'services.apiServices': { kind: 'view', resource: 'API_SERVICE' },
      'services.databases': { kind: 'view', resource: 'DATABASE_SERVICE' },
      'services.messaging': { kind: 'view', resource: 'MESSAGING_SERVICE' },
      'services.dashboards': { kind: 'view', resource: 'DASHBOARD_SERVICE' },
      'services.pipelines': { kind: 'view', resource: 'PIPELINE_SERVICE' },
      'services.mlmodels': { kind: 'view', resource: 'ML_MODEL_SERVICE' },
      'services.storages': { kind: 'view', resource: 'STORAGE_SERVICE' },
      'services.search': { kind: 'view', resource: 'SEARCH_SERVICE' },
      'services.metadata': { kind: 'view', resource: 'METADATA_SERVICE' },
      'services.drives': { kind: 'view', resource: 'DRIVE_SERVICE' },
      'services.dataObservability': { kind: 'always' },
      apps: { kind: 'admin' },
      notifications: { kind: 'view', resource: 'EVENT_SUBSCRIPTION' },
      'notifications.alerts': { kind: 'view', resource: 'EVENT_SUBSCRIPTION' },
      'notifications.announcements': { kind: 'admin' },
      members: undefined,
      'members.teams': { kind: 'view', resource: 'TEAM' },
      'members.users': { kind: 'view', resource: 'USER' },
      'members.admins': { kind: 'view', resource: 'USER' },
      'members.online-users': { kind: 'admin' },
      access: undefined,
      'access.roles': { kind: 'admin' },
      'access.policies': { kind: 'admin' },
      'access.permission-debugger': { kind: 'admin' },
      'access.audit-logs': { kind: 'auditOrAdmin' },
      preferences: undefined,
      'preferences.appearance': { kind: 'admin' },
      'preferences.email': { kind: 'admin' },
      'preferences.loginConfiguration': { kind: 'loginConfig' },
      'preferences.om-health': { kind: 'admin' },
      'preferences.profiler-configuration': { kind: 'admin' },
      'preferences.data-quality': { kind: 'admin' },
      'preferences.search-settings': { kind: 'admin' },
      'preferences.lineageConfig': { kind: 'admin' },
      'preferences.om-url-config': { kind: 'admin' },
      'preferences.dataAssetRules': { kind: 'admin' },
      'preferences.learning-resources': { kind: 'admin' },
      'preferences.appMode': { kind: 'admin' },
      'preferences.glossary': { kind: 'admin' },
      'preferences.timeFormat': { kind: 'admin' },
      customProperties: undefined,
      bots: { kind: 'admin' },
      persona: { kind: 'admin' },
      sso: { kind: 'admin' },
      governance: undefined,
      'governance.glossary-term-relations': { kind: 'admin' },
      'governance.workflow-definitions': { kind: 'admin' },
      'governance.intake-forms': { kind: 'admin' },
    };
    const all = flattenSettingsRegistry();
    for (const entry of all) {
      if (entry.key in expected) {
        expect(entry.permissionRule, entry.key).toEqual(expected[entry.key]);
      } else {
        // Search-settings nested items and custom-properties items: all admin-only.
        expect(entry.permissionRule, entry.key).toEqual({ kind: 'admin' });
      }
    }
    // The rule-less categories are exactly the six §5.2 lists.
    expect(all.filter((entry) => !entry.permissionRule).map((entry) => entry.key)).toEqual([
      'services',
      'members',
      'access',
      'preferences',
      'customProperties',
      'governance',
    ]);
  });
});

describe('permission rules and §5.2 filtering (live evaluator)', () => {
  // The registry holds rule DATA only; evaluation is the single live
  // definition in ./permissionRules. These tests pin the registry's
  // rule data by filtering the real registry through that evaluator.
  // Rule-kind and login-matrix mechanics are covered in
  // permissionRules.test.ts; what is asserted here is which items the
  // registry's own rules admit under each grant shape.
  it('evaluates each rule kind through the live evaluator', async () => {
    const ctx = liveContext({ viewResources: ['USER'], auditLogs: true });
    await expect(evaluatePermissionRule({ kind: 'admin' }, ctx)).resolves.toBe(false);
    await expect(evaluatePermissionRule({ kind: 'always' }, ctx)).resolves.toBe(true);
    await expect(
      evaluatePermissionRule({ kind: 'view', resource: 'USER' }, ctx),
    ).resolves.toBe(true);
    await expect(
      evaluatePermissionRule({ kind: 'view', resource: 'TEAM' }, ctx),
    ).resolves.toBe(false);
    await expect(evaluatePermissionRule({ kind: 'auditOrAdmin' }, ctx)).resolves.toBe(true);
    await expect(
      evaluatePermissionRule({ kind: 'auditOrAdmin' }, liveContext()),
    ).resolves.toBe(false);
    await expect(evaluatePermissionRule({ kind: 'loginConfig' }, ctx)).resolves.toBe(false);
    await expect(
      evaluatePermissionRule(
        { kind: 'loginConfig' },
        liveContext({ isAdminUser: true, authProvider: 'basic' }),
      ),
    ).resolves.toBe(true);
  });

  it('hides everything but the always-true item for a user with no grants', async () => {
    const visible = await filterVisibleSettingsItems(SETTINGS_REGISTRY, liveContext());
    // services survives on its always-visible Data Observability child (§5.2).
    expect(visible.map((entry) => entry.key)).toEqual(['services']);
    expect(childKeys(visible[0]!)).toEqual(['services.dataObservability']);
  });

  it('shows a rule-less category iff it has visible children', async () => {
    const visible = await filterVisibleSettingsItems(
      SETTINGS_REGISTRY,
      liveContext({ viewResources: ['USER'] }),
    );
    const members = visible.find((entry) => entry.key === 'members');
    expect(members).toBeTruthy();
    expect(childKeys(members!)).toEqual(['members.users', 'members.admins']);
    // services still shows its always-visible child only.
    const services = visible.find((entry) => entry.key === 'services');
    expect(childKeys(services!)).toEqual(['services.dataObservability']);
  });

  it('shows a ruled category by its rule, with children filtered separately', async () => {
    const visible = await filterVisibleSettingsItems(
      SETTINGS_REGISTRY,
      liveContext({ viewResources: ['EVENT_SUBSCRIPTION'] }),
    );
    const notifications = visible.find((entry) => entry.key === 'notifications');
    expect(notifications).toBeTruthy();
    expect(childKeys(notifications!)).toEqual(['notifications.alerts']);
  });

  it('shows access for an audit-log grant alone, with only the audit-logs card', async () => {
    const visible = await filterVisibleSettingsItems(
      SETTINGS_REGISTRY,
      liveContext({ auditLogs: true }),
    );
    const access = visible.find((entry) => entry.key === 'access');
    expect(access).toBeTruthy();
    expect(childKeys(access!)).toEqual(['access.audit-logs']);
  });

  it('shows everything to an admin with full view grants and never mutates the registry', async () => {
    const before = JSON.stringify(SETTINGS_REGISTRY);
    // An admin's permission payload grants view on every resource; the
    // fixture models that payload explicitly — the evaluator never
    // treats admin-ness itself as a view grant (pin evaluates the
    // permissions data, not isAdminUser, for view rules).
    const visible = await filterVisibleSettingsItems(
      SETTINGS_REGISTRY,
      liveContext({
        isAdminUser: true,
        viewResources: Object.keys(RESOURCE_KEY_BY_ENTITY) as ResourceEntityName[],
        auditLogs: true,
      }),
    );
    expect(visible).toHaveLength(11);
    const total = (entries: readonly SettingsRegistryItem[]): number =>
      entries.reduce(
        (sum, entry) => sum + 1 + (entry.items ? total(entry.items) : 0),
        0,
      );
    expect(total(visible)).toBe(98);
    expect(JSON.stringify(SETTINGS_REGISTRY)).toBe(before);
  });

  it('hides the view-ruled notifications category from an admin with no view grants', async () => {
    const visible = await filterVisibleSettingsItems(
      SETTINGS_REGISTRY,
      liveContext({ isAdminUser: true }),
    );
    expect(visible.map((entry) => entry.key)).not.toContain('notifications');
    expect(visible).toHaveLength(10);
  });

  it('applies the login-configuration menu matrix through the loginConfig rule', async () => {
    const matrix: Array<[string | undefined, boolean, boolean]> = [
      ['basic', true, true],
      ['ldap', true, true],
      ['openmetadata', true, true],
      ['google', true, false],
      ['saml', true, false],
      [undefined, true, true],
      ['basic', false, false],
      [undefined, false, false],
    ];
    for (const [provider, isAdmin, expectedVisible] of matrix) {
      await expect(
        evaluatePermissionRule(
          { kind: 'loginConfig' },
          liveContext({ isAdminUser: isAdmin, authProvider: provider }),
        ),
        `${provider}/${isAdmin}`,
      ).resolves.toBe(expectedVisible);
    }
  });
});

describe('navigation dispatch (§3.6)', () => {
  it('maps single, two, and three-segment keys to their settings segments', () => {
    expect(resolveSettingsNavigation('apps')).toEqual({
      kind: 'settings',
      key: 'apps',
      segments: ['apps'],
    });
    expect(resolveSettingsNavigation('services.databases')).toEqual({
      kind: 'settings',
      key: 'services.databases',
      segments: ['services', 'databases'],
    });
    expect(resolveSettingsNavigation('preferences.search-settings.tables')).toEqual({
      kind: 'settings',
      key: 'preferences.search-settings.tables',
      segments: ['preferences', 'search-settings', 'tables'],
    });
    expect(defaultSettingsPathForKey('preferences.search-settings.tables')).toBe(
      '/settings/preferences/search-settings/tables',
    );
    expect(defaultSettingsPathForKey('governance.workflow-definitions')).toBe(
      '/settings/governance/workflow-definitions',
    );
  });

  it('routes members.teams through its target descriptor, with the FQN todo', () => {
    const target = resolveSettingsNavigation('members.teams');
    expect(target?.kind).toBe('teams-list');
    expect(target).toMatchObject({
      key: 'members.teams',
      segments: ['members', 'teams'],
    });
    expect(target && 'todo' in target ? target.todo : '').toContain('Organization');
    expect(target && 'todo' in target ? target.todo : '').toContain('D-11');
    // No other entry carries a target descriptor.
    expect(
      flattenSettingsRegistry()
        .filter((entry) => entry.target)
        .map((entry) => entry.key),
    ).toEqual(['members.teams']);
  });

  it('resolves no target for unknown keys', () => {
    expect(resolveSettingsNavigation('services.security')).toBeUndefined();
    expect(resolveSettingsNavigation('search')).toBeUndefined();
    expect(resolveSettingsNavigation('nope')).toBeUndefined();
    expect(findSettingsRegistryItem('services.security')).toBeUndefined();
  });
});

describe('breadcrumb category names (§9.2)', () => {
  it('holds the 13 pin settingCategories entries, keyed by bare segment', () => {
    expect(Object.keys(SETTINGS_BREADCRUMB_NAMES)).toEqual([
      'services',
      'notifications',
      'members',
      'access',
      'preferences',
      'search-settings',
      'customProperties',
      'bots',
      'apps',
      'persona',
      'sso',
      'governance',
      'workflow-definitions',
    ]);
    expect(settingsBreadcrumbName('members')).toMatchObject({
      nameKey: 'settings.registry.members.breadcrumbName',
      path: 'members',
    });
    expect(settingsBreadcrumbName('search-settings')).toMatchObject({
      nameKey: 'settings.registry.preferences.searchSettings.breadcrumbName',
      path: 'preferences/search-settings',
    });
    expect(settingsBreadcrumbName('workflow-definitions')).toMatchObject({
      nameKey: 'settings.registry.governance.workflowDefinitions.breadcrumbName',
      path: 'governance/workflow-definitions',
    });
    expect(settingsBreadcrumbName('nope')).toBeUndefined();
  });

  it('keeps breadcrumb names on separate keys from card titles, with pin values', () => {
    const expected: Record<string, string> = {
      services: 'Services',
      notifications: 'Notifications',
      members: 'Members',
      access: 'Access Control',
      preferences: 'Preferences',
      'search-settings': 'Search',
      customProperties: 'Custom Properties',
      bots: 'Bots',
      apps: 'Applications',
      persona: 'Persona',
      sso: 'SSO',
      governance: 'Governance',
      'workflow-definitions': 'Workflows',
    };
    for (const [key, name] of Object.entries(expected)) {
      const entry = SETTINGS_BREADCRUMB_NAMES[key]!;
      expect(entry.key).toBe(key);
      expect(enT(entry.nameKey), key).toBe(name);
      expect(zhT(entry.nameKey), key).toBeTruthy();
      // Breadcrumb keys never equal a card title key, even when values match.
      const cardKey =
        key === 'search-settings'
          ? 'preferences.search-settings'
          : key === 'workflow-definitions'
            ? 'governance.workflow-definitions'
            : key;
      expect(entry.nameKey).not.toBe(findSettingsRegistryItem(cardKey)?.titleKey);
    }
    // The three divergences from card titles are pin verbatim.
    expect(enT('settings.registry.members.title')).toBe('Team & User Management');
    expect(enT('settings.registry.members.breadcrumbName')).toBe('Members');
    expect(enT('settings.registry.persona.title')).toBe('Personas');
    expect(enT('settings.registry.persona.breadcrumbName')).toBe('Persona');
  });
});

describe('search-settings segment mapping (§3.5)', () => {
  it('round-trips all 23 segments through entity keys', () => {
    const segments = childKeys(findSettingsRegistryItem('preferences.search-settings')!).map(
      (key) => settingsKeySegment(key),
    );
    expect(segments).toHaveLength(23);
    for (const segment of segments) {
      const entity = searchSettingsEntityForSegment(segment);
      expect(entity, segment).toBeTruthy();
      expect(searchSettingsSegmentForEntity(entity!), segment).toBe(segment);
    }
    expect(searchSettingsEntityForSegment('tables')).toBe('table');
    expect(searchSettingsEntityForSegment('column')).toBe('tableColumn');
    expect(searchSettingsEntityForSegment('query')).toBe('query');
    expect(searchSettingsEntityForSegment('tags')).toBe('tag');
    expect(searchSettingsEntityForSegment('apiEndpoints')).toBe('apiEndpoint');
  });

  it('returns undefined for unknown segments and entities (no fallback)', () => {
    expect(searchSettingsEntityForSegment('charts')).toBeUndefined();
    expect(searchSettingsEntityForSegment('articles')).toBeUndefined();
    expect(searchSettingsEntityForSegment('bogus')).toBeUndefined();
    expect(searchSettingsSegmentForEntity('chart')).toBeUndefined();
    expect(searchSettingsSegmentForEntity('page')).toBeUndefined();
    expect(searchSettingsSegmentForEntity('bogus')).toBeUndefined();
  });
});

describe('rendered-title sorting (§3.4, §3.5)', () => {
  it('sorts custom-properties and search-settings items by rendered title per locale', () => {
    for (const parentKey of ['customProperties', 'preferences.search-settings']) {
      const parent = findSettingsRegistryItem(parentKey)!;
      const items = parent.items ?? [];
      const enSorted = sortSettingsItemsByRenderedTitle(items, enT);
      expect(enSorted.map((entry) => enT(entry.titleKey))).toEqual(
        [...enSorted.map((entry) => enT(entry.titleKey))].sort((a, b) =>
          a.localeCompare(b),
        ),
      );
      const zhSorted = sortSettingsItemsByRenderedTitle(items, zhT);
      expect(zhSorted.map((entry) => zhT(entry.titleKey))).toEqual(
        [...zhSorted.map((entry) => zhT(entry.titleKey))].sort((a, b) =>
          a.localeCompare(b),
        ),
      );
      expect(zhSorted.map((entry) => entry.key)).not.toEqual(
        enSorted.map((entry) => entry.key),
      );
      // The helper never mutates its input.
      expect(items).toEqual(parent.items);
    }
  });
});

describe('registry copy (§12)', () => {
  const expectedTitles: Record<string, string> = {
    services: 'Services',
    'services.apiServices': 'APIs',
    'services.databases': 'Databases',
    'services.messaging': 'Messaging',
    'services.dashboards': 'Dashboards',
    'services.pipelines': 'Pipelines',
    'services.mlmodels': 'ML Models',
    'services.storages': 'Storage',
    'services.search': 'Search Engines',
    'services.metadata': 'Catalogs',
    'services.drives': 'Drives',
    'services.dataObservability': 'Data Observability',
    apps: 'Applications',
    notifications: 'Notifications',
    'notifications.alerts': 'Alerts',
    'notifications.announcements': 'Announcements',
    members: 'Team & User Management',
    'members.teams': 'Teams',
    'members.users': 'Users',
    'members.admins': 'Admins',
    'members.online-users': 'Online Users',
    access: 'Access Control',
    'access.roles': 'Roles',
    'access.policies': 'Policies',
    'access.permission-debugger': 'Permission Debugger',
    'access.audit-logs': 'Audit Logs',
    preferences: 'Preferences',
    'preferences.appearance': 'Theme',
    'preferences.email': 'Email',
    'preferences.loginConfiguration': 'Login Configuration',
    'preferences.om-health': 'Health Check',
    'preferences.profiler-configuration': 'Profiler Configuration',
    'preferences.data-quality': 'Data Quality',
    'preferences.search-settings': 'Search',
    'preferences.lineageConfig': 'Lineage',
    'preferences.om-url-config': '{brandName} URL',
    'preferences.dataAssetRules': 'Data Asset Rules',
    'preferences.learning-resources': 'Learning Resources',
    'preferences.appMode': 'Default App Mode',
    'preferences.glossary': 'Glossary',
    'preferences.timeFormat': 'Default Time Format',
    customProperties: 'Custom Properties',
    'customProperties.apiCollections': 'API Collection',
    'customProperties.apiEndpoints': 'API Endpoint',
    'customProperties.dataProducts': 'Data Product',
    'customProperties.dashboardDataModels': 'Dashboard Data Models',
    'customProperties.databases': 'Database',
    'customProperties.databaseSchemas': 'Database Schema',
    'customProperties.metrics': 'Metric',
    'customProperties.tables': 'Tables',
    'customProperties.storedProcedures': 'Stored Procedures',
    'customProperties.dashboards': 'Dashboards',
    'customProperties.pipelines': 'Pipelines',
    'customProperties.topics': 'Topics',
    'customProperties.containers': 'Containers',
    'customProperties.mlmodels': 'ML Models',
    'customProperties.searchIndexes': 'Search Indexes',
    'customProperties.column': 'Columns',
    'customProperties.glossaryTerm': 'Glossary Term',
    'customProperties.domains': 'Domain',
    'customProperties.charts': 'Charts',
    'customProperties.directories': 'Directories',
    'customProperties.files': 'Files',
    'customProperties.spreadsheets': 'Spreadsheets',
    'customProperties.worksheets': 'Worksheets',
    'customProperties.articles': 'Articles',
    'customProperties.teams': 'Teams',
    'customProperties.users': 'Users',
    bots: 'Bots',
    persona: 'Personas',
    sso: 'SSO',
    governance: 'Governance',
    'governance.glossary-term-relations': 'Glossary Term Relations',
    'governance.workflow-definitions': 'Workflows',
    'governance.intake-forms': 'Intake Forms',
  };

  const expectedSearchTitles: Record<string, string> = {
    tables: 'Tables',
    dashboards: 'Dashboards',
    pipelines: 'Pipelines',
    topics: 'Topics',
    glossaryTerm: 'Glossary Term',
    apiEndpoints: 'API Endpoint',
    dashboardDataModels: 'Dashboard Data Models',
    storedProcedures: 'Stored Procedures',
    containers: 'Containers',
    mlmodels: 'ML Models',
    dataProducts: 'Data Products',
    query: 'Query',
    tags: 'Tags',
    databases: 'Databases',
    databaseSchemas: 'Database Schema',
    domains: 'Domains',
    metrics: 'Metrics',
    searchIndexes: 'Search Indexes',
    directories: 'Directories',
    files: 'Files',
    spreadsheets: 'Spreadsheets',
    worksheets: 'Worksheets',
    column: 'Columns',
  };

  it('renders every card title to the pin en-us value', () => {
    const all = flattenSettingsRegistry();
    expect(Object.keys(expectedTitles)).toHaveLength(75);
    for (const entry of all) {
      const expected =
        entry.key in expectedTitles
          ? expectedTitles[entry.key]
          : expectedSearchTitles[settingsKeySegment(entry.key)];
      expect(expected, entry.key).toBeTruthy();
      expect(enT(entry.titleKey), entry.key).toBe(expected);
      expect(zhT(entry.titleKey), entry.key).toBeTruthy();
    }
  });

  it('keeps the B1 singular/plural tables separate: custom singular, search plural', () => {
    // §3.3 custom-properties card titles: the 8 singulars.
    expect(enT('settings.registry.customProperties.apiCollections.title')).toBe(
      'API Collection',
    );
    expect(enT('settings.registry.customProperties.apiEndpoints.title')).toBe(
      'API Endpoint',
    );
    expect(enT('settings.registry.customProperties.dataProducts.title')).toBe(
      'Data Product',
    );
    expect(enT('settings.registry.customProperties.databases.title')).toBe('Database');
    expect(enT('settings.registry.customProperties.databaseSchemas.title')).toBe(
      'Database Schema',
    );
    expect(enT('settings.registry.customProperties.metrics.title')).toBe('Metric');
    expect(enT('settings.registry.customProperties.glossaryTerm.title')).toBe(
      'Glossary Term',
    );
    expect(enT('settings.registry.customProperties.domains.title')).toBe('Domain');
    // §3.4 search-settings nested titles: the same segments stay plural.
    expect(enT('settings.registry.preferences.searchSettings.dataProducts.title')).toBe(
      'Data Products',
    );
    expect(enT('settings.registry.preferences.searchSettings.databases.title')).toBe(
      'Databases',
    );
    expect(enT('settings.registry.preferences.searchSettings.domains.title')).toBe(
      'Domains',
    );
    expect(enT('settings.registry.preferences.searchSettings.metrics.title')).toBe(
      'Metrics',
    );
    // URL segments stay plural in both tables.
    expect(settingsKeySegment('customProperties.databases')).toBe('databases');
    expect(settingsKeySegment('preferences.search-settings.databases')).toBe('databases');
  });

  it('renders every non-template description to the pin en-us value', () => {
    const expected: Record<string, string> = {
      services: 'Set up connectors and ingest metadata from diverse sources',
      'services.apiServices': 'Ingest metadata from the most popular API services.',
      'services.databases': 'Ingest metadata from the most popular database services.',
      'services.messaging': 'Ingest metadata from the most used messaging services.',
      'services.dashboards': 'Ingest metadata from the most popular dashboard services.',
      'services.pipelines': 'Ingest metadata from the most used pipeline services.',
      'services.mlmodels': 'Ingest metadata from ML Model services through the UI.',
      'services.storages': 'Ingest metadata from the most popular storage services.',
      'services.search': 'Ingest metadata from the most popular search services.',
      'services.metadata': 'Ingest metadata from metadata services right from the UI.',
      'services.drives': 'Ingest metadata from the most popular drive services.',
      'services.dataObservability':
        'Ingest metadata from test suite services right from the UI.',
      apps: 'Improve your data using applications like AskCollate, Data Insights, and Search Indexing',
      notifications: 'Set up notifications to receive real-time updates and timely alerts.',
      'notifications.announcements':
        'Broadcast system-wide banners for maintenance, releases, and org-wide updates.',
      members: 'Streamline access to users and teams in {brandName}.',
      'members.teams':
        'Represent your entire organizational structure with hierarchical teams.',
      'members.users':
        'View and manage regular users in your organization. For admin users, please visit the Admin page.',
      'members.admins':
        'View and manage admin users in your organization. For regular users, please visit the Users page.',
      'members.online-users': 'View users who have been active recently in the system.',
      access:
        'Align with your organizational hierarchy and team access with roles and policies.',
      'access.roles': 'Assign comprehensive role based access to Users or Teams.',
      'access.policies':
        'Define policies with a set of rules for fine-grained access control.',
      'access.permission-debugger':
        'Debug and understand user permissions across roles, teams, and policies.',
      'access.audit-logs':
        'Review who changed what by browsing persisted metadata change events.',
      preferences: 'Tailor the {brandName} UX to suit your organizational and team needs.',
      'preferences.appearance':
        'Customize {brandName} with your company logo, monogram, favicon and brand color.',
      'preferences.email': 'Configure the SMTP Settings for sending Emails.',
      'preferences.loginConfiguration':
        'Define the handling of failed login attempts and JWT token expiry.',
      'preferences.om-health':
        'Check database access, ES health, Pipeline Service Client, jwks configuration and migrations',
      'preferences.profiler-configuration':
        'Customize globally the behavior of the profiler by setting the metrics to compute based on columns data types',
      'preferences.data-quality':
        'Configure how data quality is organised across your workspace.',
      'preferences.search-settings':
        'Ability to configure the search settings to suit your needs.',
      'preferences.lineageConfig': 'Configure the lineage view settings.',
      'preferences.om-url-config': 'Configure the {brandName} URL Settings.',
      'preferences.dataAssetRules':
        "Data Asset Rules help you manage metadata validations at the platform level. If an asset does not follow a rule, you won't be able to make any changes to it unless you fix the validation first.",
      'preferences.learning-resources':
        'Explore product features and learn how they work through our resources',
      'preferences.appMode':
        "The 'first impression' mode for users who haven't picked one. User preferences and persona-level app modes still win over this default.",
      'preferences.glossary':
        'Apply classification tags from glossary terms to associated assets across the catalog. Turn off to keep these tags on glossary terms only.',
      'preferences.timeFormat':
        'Configure the default time format (12-hour or 24-hour) used to display timestamps for all users.',
      customProperties:
        'Capture custom metadata to enrich your data assets by extending the attributes.',
      bots: 'Create well-defined bots with scoped access permissions.',
      persona: 'Enhance and customize the user experience with Personas.',
      sso: 'SSO configuration directly from the UI',
      governance: 'Configure governance settings for your metadata platform.',
      'governance.glossary-term-relations':
        'Configure semantic relation types for glossary terms. Define hierarchical, associative, and equivalence relationships to build a rich ontology.',
      'governance.workflow-definitions':
        'View and edit governance workflow definitions: triggers, tasks, and automation configuration.',
      'governance.intake-forms':
        'Define the fields your governance policy requires for Data Products, Domains, Glossary Terms, and Metrics. Enforced in both the API and the UI.',
    };
    for (const [key, value] of Object.entries(expected)) {
      const entry = findSettingsRegistryItem(key)!;
      expect(enT(entry.descriptionKey), key).toBe(value);
      expect(zhT(entry.descriptionKey), key).toBeTruthy();
    }
    // Alerts shares the notifications description key (pin uses one key for both).
    expect(findSettingsRegistryItem('notifications.alerts')!.descriptionKey).toBe(
      'settings.registry.notifications.description',
    );
    // The two approved whitespace artifacts are repaired, not copied.
    expect(enT('settings.registry.customProperties.description')).not.toMatch(/^\s/);
    expect(
      enT('settings.registry.templates.searchSettingsForEntity'),
    ).not.toContain('  ');
  });

  it('uses the shared templates for search-settings and custom-properties descriptions', () => {
    expect(enT('settings.registry.templates.searchSettingsForEntity')).toBe(
      'Search settings based on ranking for {entity}',
    );
    expect(enT('settings.registry.templates.defineCustomPropertyForEntity')).toBe(
      'Define the custom properties for your {entity} to serve your organizational needs.',
    );
    expect(enT('settings.registry.templates.defineCustomPropertyForColumn')).toBe(
      'Define the custom properties for column level on tables and dashboard data models.',
    );
    const searchParent = findSettingsRegistryItem('preferences.search-settings')!;
    for (const child of searchParent.items ?? []) {
      expect(child.descriptionKey).toBe(
        'settings.registry.templates.searchSettingsForEntity',
      );
      expect(child.descriptionEntityKey).toBe(child.titleKey);
    }
    const customParent = findSettingsRegistryItem('customProperties')!;
    for (const child of customParent.items ?? []) {
      if (settingsKeySegment(child.key) === 'column') {
        expect(child.descriptionKey).toBe(
          'settings.registry.templates.defineCustomPropertyForColumn',
        );
        expect(child.descriptionEntityKey).toBeUndefined();
      } else {
        expect(child.descriptionKey).toBe(
          'settings.registry.templates.defineCustomPropertyForEntity',
        );
        expect(child.descriptionEntityKey).toBe(child.titleKey);
      }
    }
  });

  it('interpolates brandName and entity on render', () => {
    expect(registryTitle(enT, findSettingsRegistryItem('preferences.om-url-config')!)).toBe(
      'iSmart URL',
    );
    expect(registryDescription(enT, findSettingsRegistryItem('members')!)).toBe(
      'Streamline access to users and teams in iSmart.',
    );
    expect(
      registryDescription(
        enT,
        findSettingsRegistryItem('preferences.search-settings.tables')!,
      ),
    ).toBe('Search settings based on ranking for Tables');
    expect(
      registryDescription(enT, findSettingsRegistryItem('customProperties.databases')!),
    ).toBe(
      'Define the custom properties for your Database to serve your organizational needs.',
    );
    expect(
      registryDescription(enT, findSettingsRegistryItem('customProperties.tables')!),
    ).toBe(
      'Define the custom properties for your Tables to serve your organizational needs.',
    );
    expect(
      registryDescription(enT, findSettingsRegistryItem('customProperties.column')!),
    ).toBe('Define the custom properties for column level on tables and dashboard data models.');
    expect(registryTitle(zhT, findSettingsRegistryItem('preferences.om-url-config')!)).toBe(
      'iSmart URL',
    );
    expect(registryDescription(zhT, findSettingsRegistryItem('members')!)).toBe(
      '简化在 iSmart 中访问用户和团队的流程。',
    );
  });

  it('keeps the shell copy on pin values (§5.1, §5.4, §9.4, §9.5)', () => {
    expect(enT('settings.shell.hubDescription')).toBe(
      'Ability to configure the {brandName} application to suit your needs.',
    );
    expect(enT('settings.shell.accessDenied')).toBe('Access Denied');
    expect(enT('settings.shell.noAccessPlaceholder')).toBe(
      "You don't have necessary permissions. Please check with the admin to get the {entity} permission.",
    );
    expect(enT('settings.shell.entityConfiguration')).toBe('{entity} Configuration');
    expect(enT('settings.shell.learningResource')).toBe('Learning Resource');
    expect(
      enT('settings.shell.noAccessPlaceholder', { entity: 'Settings' }),
    ).toBe(
      "You don't have necessary permissions. Please check with the admin to get the Settings permission.",
    );
  });

  it('keeps en-US and zh-CN registry/shell leaves in lockstep with matching placeholders', () => {
    const leafKeys = (value: unknown, prefix = ''): string[] => {
      if (value !== null && typeof value === 'object') {
        return Object.entries(value as Catalog).flatMap(([key, child]) =>
          leafKeys(child, prefix ? `${prefix}.${key}` : key),
        );
      }
      return prefix ? [prefix] : [];
    };
    const placeholders = (value: string): string[] =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
    // Values identical by design: untranslated proper nouns and the brand template.
    const identicalAllowed = new Set([
      'settings.registry.sso.title',
      'settings.registry.sso.breadcrumbName',
      'settings.registry.persona.breadcrumbName',
      'settings.registry.preferences.omUrlConfig.title',
    ]);
    for (const root of ['settings.registry', 'settings.shell']) {
      const keys = leafKeys(lookup(enUS, root), root);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        const enValue = lookup(enUS, key);
        const zhValue = lookup(zhCN, key);
        expect(typeof enValue, key).toBe('string');
        expect(typeof zhValue, key).toBe('string');
        expect((zhValue as string).length, key).toBeGreaterThan(0);
        expect(placeholders(zhValue as string), key).toEqual(
          placeholders(enValue as string),
        );
        if (identicalAllowed.has(key)) {
          expect(zhValue, key).toBe(enValue);
        } else {
          expect(zhValue, key).not.toBe(enValue);
        }
      }
    }
  });
});
