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
  buildSettingsBreadcrumbCatalog,
  capitalizeSegment,
  DATA_OBSERVABILITY_TAB,
  getSettingPageBreadcrumbs,
  servicesTabEntityName,
  startCaseSegment,
  toSmBreadcrumbItems,
  type SettingsBreadcrumbCatalog,
  type SettingsLocationResolver,
} from './breadcrumbs';

/**
 * The DESIGN §9.2 category-name table, with pin en-us values (pin
 * `GlobalSettingsClassBase.ts:94-147` `settingCategories`). The builder never
 * sees this table directly in production — the registry module supplies it —
 * so the fixture stands in for the S-REG export.
 */
const SECTION_9_2_ROWS: Array<[key: string, label: string, path: string]> = [
  ['services', 'Services', 'services'],
  ['notifications', 'Notifications', 'notifications'],
  ['members', 'Members', 'members'],
  ['access', 'Access Control', 'access'],
  ['preferences', 'Preferences', 'preferences'],
  ['search-settings', 'Search', 'preferences/search-settings'],
  ['customProperties', 'Custom Properties', 'customProperties'],
  ['bots', 'Bots', 'bots'],
  ['apps', 'Applications', 'apps'],
  ['persona', 'Persona', 'persona'],
  ['sso', 'SSO', 'sso'],
  ['governance', 'Governance', 'governance'],
  ['workflow-definitions', 'Workflows', 'governance/workflow-definitions'],
];

function catalogWith(rows: Array<[key: string, label: string, path: string]>): SettingsBreadcrumbCatalog {
  return {
    settingsLabel: 'Settings',
    entries: new Map(rows.map(([key, label, path]) => [key, { label, path }])),
  };
}

const catalog = catalogWith(SECTION_9_2_ROWS);

/** String-returning resolver: asserts the exact path the builder selects. */
const locate: SettingsLocationResolver = (path) => (path ? `/settings/${path}` : '/settings');

describe('getSettingPageBreadcrumbs (pin getSettingPageEntityBreadCrumb)', () => {
  it('renders a category page as Settings > category, category active', () => {
    expect(getSettingPageBreadcrumbs(catalog, locate, 'members')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Members' },
    ]);
  });

  it('links the category crumb when an entity name is present', () => {
    expect(getSettingPageBreadcrumbs(catalog, locate, 'access', 'Policies')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Access Control', to: '/settings/access' },
      { label: 'Policies' },
    ]);
  });

  it('renders the sub-category level linked only when an entity name is present', () => {
    expect(getSettingPageBreadcrumbs(catalog, locate, 'preferences', 'Tables', 'search-settings')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Preferences', to: '/settings/preferences' },
      { label: 'Search', to: '/settings/preferences/search-settings' },
      { label: 'Tables' },
    ]);
    expect(getSettingPageBreadcrumbs(catalog, locate, 'preferences', undefined, 'search-settings')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Preferences' },
      { label: 'Search' },
    ]);
  });

  it('renders an unknown category as the empty-name crumb (D-10), never throwing', () => {
    expect(getSettingPageBreadcrumbs(catalog, locate, 'no-such-category')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: '' },
    ]);
  });

  it('renders an unknown category with an entity name as the empty unlinked crumb', () => {
    // Pin would throw here (`categoryObject.url` on undefined); no pin call
    // site combines an unknown category with an entity name. The builder
    // stays total instead of crashing the page.
    expect(getSettingPageBreadcrumbs(catalog, locate, 'no-such-category', 'Entity')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: '' },
      { label: 'Entity' },
    ]);
  });

  it('reproduces pin literally for an unknown sub-category with an entity name', () => {
    // Pin: `getSettingPath(subCategoryObject?.url ?? '')`, and an empty
    // `getSettingPath` input yields `/settings` — the empty-name crumb links
    // to the Hub. No pin call site produces this; the test pins the literal
    // mechanism so a future "fix" cannot silently change it.
    expect(getSettingPageBreadcrumbs(catalog, locate, 'preferences', 'Entity', 'no-such-sub')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Preferences', to: '/settings/preferences' },
      { label: '', to: '/settings' },
      { label: 'Entity' },
    ]);
  });

  it('treats empty-string entity name and sub-category as absent, like pin', () => {
    expect(getSettingPageBreadcrumbs(catalog, locate, 'members', '', '')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Members' },
    ]);
  });

  it('resolves any catalog entry as a sub-category (mechanism is catalog-driven)', () => {
    // A fixture-only entry proves the builder does not hard-code the §9.2
    // sub-category set: whatever the registry module supplies resolves the
    // same way. This pins the mechanism only; which pages pass which
    // sub-category is a wiring decision owned by the design table.
    const extended = catalogWith([...SECTION_9_2_ROWS, ['test-sub', 'Test Sub', 'members/test-sub']]);
    expect(getSettingPageBreadcrumbs(extended, locate, 'members', 'Entity', 'test-sub')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Members', to: '/settings/members' },
      { label: 'Test Sub', to: '/settings/members/test-sub' },
      { label: 'Entity' },
    ]);
  });

  it('keeps the §9.2 breadcrumb names distinct from the card titles', () => {
    // Members (not "Team & User Management") and Persona (singular, not
    // "Personas") are the two names where the breadcrumb table differs from
    // the registry card titles (DESIGN §9.2). The builder reads the table,
    // so it can never render the card title here.
    expect(getSettingPageBreadcrumbs(catalog, locate, 'members')[1]).toEqual({ label: 'Members' });
    expect(getSettingPageBreadcrumbs(catalog, locate, 'persona')[1]).toEqual({ label: 'Persona' });
  });
});

describe('§9.3 rows through the default builder', () => {
  it.each([
    ['members', 'Users'],
    ['members', 'Admins'],
    ['members', 'Teams'],
    ['members', 'Online Users'],
    ['access', 'Roles'],
    ['access', 'Policies'],
    ['access', 'Permission Debugger'],
    ['access', 'Audit Logs'],
    ['notifications', 'Alerts'],
    ['notifications', 'Announcements'],
    ['governance', 'Glossary Term Relations'],
    ['governance', 'Intake Forms'],
  ])('renders the %s / %s list as Settings > category > entry', (category, entry) => {
    const categoryLabel = catalog.entries.get(category)?.label ?? '';
    expect(getSettingPageBreadcrumbs(catalog, locate, category, entry)).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: categoryLabel, to: `/settings/${category}` },
      { label: entry },
    ]);
  });

  it.each([['bots'], ['apps'], ['persona'], ['sso'], ['customProperties']])(
    'renders the single-card %s page as Settings > category',
    (category) => {
      const categoryLabel = catalog.entries.get(category)?.label ?? '';
      expect(getSettingPageBreadcrumbs(catalog, locate, category)).toEqual([
        { label: 'Settings', to: '/settings' },
        { label: categoryLabel },
      ]);
    },
  );

  it.each([['Theme'], ['Health Check'], ['Data Quality'], ['Search']])(
    'renders the preferences page %s as Settings > Preferences > entry',
    (entry) => {
      expect(getSettingPageBreadcrumbs(catalog, locate, 'preferences', entry)).toEqual([
        { label: 'Settings', to: '/settings' },
        { label: 'Preferences', to: '/settings/preferences' },
        { label: entry },
      ]);
    },
  );

  it('renders the services list with the B-8 tab name rule', () => {
    const entityName = servicesTabEntityName('databases', 'Data Observability');
    expect(getSettingPageBreadcrumbs(catalog, locate, 'services', entityName)).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Services', to: '/settings/services' },
      { label: 'Databases' },
    ]);
  });
});

describe('buildSettingsBreadcrumbCatalog', () => {
  it('resolves the §9.2 record through the translator', () => {
    const built = buildSettingsBreadcrumbCatalog(
      'settings.title',
      Object.fromEntries(
        SECTION_9_2_ROWS.map(([key, , path]) => [key, { key, nameKey: `names.${key}`, path }]),
      ),
      (key) => `t:${key}`,
    );
    expect(built.settingsLabel).toBe('t:settings.title');
    expect(built.entries.get('members')).toEqual({ label: 't:names.members', path: 'members' });
    expect(built.entries.get('search-settings')).toEqual({
      label: 't:names.search-settings',
      path: 'preferences/search-settings',
    });
    expect(built.entries.size).toBe(13);
  });
});

describe('startCaseSegment (lodash startCase over the §3.4/§3.5 segment vocabulary)', () => {
  const cases: Record<string, string> = {
    tables: 'Tables',
    dashboards: 'Dashboards',
    pipelines: 'Pipelines',
    topics: 'Topics',
    glossaryTerm: 'Glossary Term',
    apiEndpoints: 'Api Endpoints',
    apiCollections: 'Api Collections',
    dashboardDataModels: 'Dashboard Data Models',
    storedProcedures: 'Stored Procedures',
    containers: 'Containers',
    mlmodels: 'Mlmodels',
    query: 'Query',
    databases: 'Databases',
    databaseSchemas: 'Database Schemas',
    domains: 'Domains',
    metrics: 'Metrics',
    searchIndexes: 'Search Indexes',
    directories: 'Directories',
    files: 'Files',
    spreadsheets: 'Spreadsheets',
    worksheets: 'Worksheets',
    column: 'Column',
    dataProducts: 'Data Products',
    tags: 'Tags',
    charts: 'Charts',
    articles: 'Articles',
    teams: 'Teams',
    users: 'Users',
    apiServices: 'Api Services',
    messaging: 'Messaging',
    metadata: 'Metadata',
    storages: 'Storages',
    search: 'Search',
    drives: 'Drives',
    dataObservability: 'Data Observability',
  };

  it.each(Object.entries(cases))('derives %s as %s', (segment, expected) => {
    expect(startCaseSegment(segment)).toBe(expected);
  });
});

describe('capitalizeSegment (lodash capitalize)', () => {
  it.each([
    ['databases', 'Databases'],
    ['messaging', 'Messaging'],
    ['users', 'Users'],
    ['admins', 'Admins'],
    ['databaseServices', 'Databaseservices'],
    ['dataObservability', 'Dataobservability'],
    ['', ''],
  ])('capitalizes %s as %s', (segment, expected) => {
    expect(capitalizeSegment(segment)).toBe(expected);
  });
});

describe('servicesTabEntityName (pin ServicesPage B-8 rule)', () => {
  it('uses the translated label for the dataObservability tab', () => {
    expect(servicesTabEntityName(DATA_OBSERVABILITY_TAB, 'Data Observability')).toBe('Data Observability');
  });

  it('capitalizes every other tab', () => {
    expect(servicesTabEntityName('databases', 'Data Observability')).toBe('Databases');
    expect(servicesTabEntityName('apiServices', 'Data Observability')).toBe('Apiservices');
  });
});

describe('toSmBreadcrumbItems', () => {
  it('converts named locations to routeName/routeParams', () => {
    expect(
      toSmBreadcrumbItems([
        { label: 'Settings', to: { name: 'settings-hub' } },
        { label: 'Members', to: { name: 'settings-category', params: { category: 'members' } } },
        { label: 'Users' },
      ]),
    ).toEqual([
      { label: 'Settings', routeName: 'settings-hub' },
      { label: 'Members', routeName: 'settings-category', routeParams: { category: 'members' } },
      { label: 'Users' },
    ]);
  });

  it('keeps a linked last crumb in the data (Data Asset Rules shape)', () => {
    const [last] = toSmBreadcrumbItems([
      { label: 'Settings', to: { name: 'settings-hub' } },
      { label: 'Preferences', to: { name: 'settings-category', params: { category: 'preferences' } } },
      {
        label: 'Data Asset Rules Configuration',
        to: { name: 'settings-preferences-entity-rules' },
      },
    ]).slice(-1);
    expect(last).toEqual({
      label: 'Data Asset Rules Configuration',
      routeName: 'settings-preferences-entity-rules',
    });
  });

  it('stringifies number params', () => {
    expect(toSmBreadcrumbItems([{ label: 'Page', to: { name: 'paged', params: { page: 2 } } }])).toEqual([
      { label: 'Page', routeName: 'paged', routeParams: { page: '2' } },
    ]);
  });

  it('renders string, hash, query, and array-param locations unlinked', () => {
    expect(
      toSmBreadcrumbItems([
        { label: 'String', to: '/settings/members' },
        { label: 'Hash', to: { name: 'persona-detail', hash: '#customize-ui' } },
        { label: 'Query', to: { name: 'search', query: { q: 'x' } } },
        { label: 'Array', to: { name: 'multi', params: { id: ['a', 'b'] } } },
      ]),
    ).toEqual([{ label: 'String' }, { label: 'Hash' }, { label: 'Query' }, { label: 'Array' }]);
  });

  it('maps an empty list to an empty list', () => {
    expect(toSmBreadcrumbItems([])).toEqual([]);
  });
});
