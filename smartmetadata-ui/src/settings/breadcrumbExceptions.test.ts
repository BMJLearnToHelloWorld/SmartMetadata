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
  alertDetailBreadcrumbs,
  applicationDetailChrome,
  botDetailBreadcrumbs,
  customPropertyTypeBreadcrumbs,
  dataAssetRulesBreadcrumbs,
  learningResourcesBreadcrumbs,
  lineageConfigurationChrome,
  noBreadcrumbs,
  omUrlConfigurationBreadcrumbs,
  personaDetailBreadcrumbs,
  searchEntitySettingBreadcrumbs,
  teamDetailBreadcrumbs,
  userDetailBreadcrumbs,
} from './breadcrumbExceptions';
import type { SettingsBreadcrumbCatalog, SettingsLocationResolver } from './breadcrumbs';

const catalog: SettingsBreadcrumbCatalog = {
  settingsLabel: 'Settings',
  entries: new Map([
    ['members', { label: 'Members', path: 'members' }],
    ['preferences', { label: 'Preferences', path: 'preferences' }],
    ['search-settings', { label: 'Search', path: 'preferences/search-settings' }],
    ['customProperties', { label: 'Custom Properties', path: 'customProperties' }],
    ['notifications', { label: 'Notifications', path: 'notifications' }],
  ]),
};

const locate: SettingsLocationResolver = (path) => (path ? `/settings/${path}` : '/settings');

/** Pin `label.entity-configuration` (`"{{entity}} Configuration"`) in en-us. */
const formatEntityConfiguration = (entity: string): string => `${entity} Configuration`;

describe('row 1 — Persona detail self-built array (no Settings root)', () => {
  const input = {
    personasLabel: 'Personas',
    entityName: 'Data Steward',
    personaListLocation: { name: 'admin-settings-persona' },
    personaDetailLocation: {
      name: 'admin-settings-persona-detail',
      params: { fqn: 'data-steward' },
      hash: '#customize-ui',
    },
    customizeCategories: [
      { key: 'app-layout', label: 'App Layout' },
      { key: 'governance', label: 'Governance' },
    ],
  };

  it('renders two linked segments without a Settings root', () => {
    expect(personaDetailBreadcrumbs(input)).toEqual([
      { label: 'Personas', to: { name: 'admin-settings-persona' } },
      {
        label: 'Data Steward',
        to: { name: 'admin-settings-persona-detail', params: { fqn: 'data-steward' }, hash: '#customize-ui' },
      },
    ]);
  });

  it('appends the unlinked category label only when the active category hits the table', () => {
    expect(personaDetailBreadcrumbs({ ...input, activeCategory: 'governance' })).toEqual([
      { label: 'Personas', to: { name: 'admin-settings-persona' } },
      {
        label: 'Data Steward',
        to: { name: 'admin-settings-persona-detail', params: { fqn: 'data-steward' }, hash: '#customize-ui' },
      },
      { label: 'Governance' },
    ]);
    expect(personaDetailBreadcrumbs({ ...input, activeCategory: 'no-such-category' })).toHaveLength(2);
  });
});

describe('row 2 — Applications detail: no breadcrumb, Browse Apps button kept', () => {
  it('expresses both halves in one chrome object', () => {
    expect(
      applicationDetailChrome({ browseAppsLabel: 'Browse Apps', appsListLocation: { name: 'admin-apps' } }),
    ).toEqual({
      breadcrumbs: [],
      browseAppsButton: { label: 'Browse Apps', to: { name: 'admin-apps' } },
    });
    expect(noBreadcrumbs()).toEqual([]);
  });
});

describe('row 3 — startCase entity names, never registry titles', () => {
  it('derives the search entity name from the segment with the search-settings sub-category', () => {
    expect(searchEntitySettingBreadcrumbs(catalog, locate, 'databaseSchemas')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Preferences', to: '/settings/preferences' },
      { label: 'Search', to: '/settings/preferences/search-settings' },
      { label: 'Database Schemas' },
    ]);
  });

  it('derives the custom-properties type name from the tab segment', () => {
    // `databaseSchemas` derives to the PLURAL "Database Schemas": the
    // registry card title for the same key is the singular "Database
    // Schema" (B1). The exception output must not be replaced by it.
    expect(customPropertyTypeBreadcrumbs(catalog, locate, 'databaseSchemas')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Custom Properties', to: '/settings/customProperties' },
      { label: 'Database Schemas' },
    ]);
    expect(customPropertyTypeBreadcrumbs(catalog, locate, 'mlmodels')[2]).toEqual({ label: 'Mlmodels' });
  });
});

describe('row 4 — Learning page singular last item', () => {
  it('renders the singular label, never the plural registry title', () => {
    expect(learningResourcesBreadcrumbs(catalog, locate, 'Learning Resource')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Preferences', to: '/settings/preferences' },
      { label: 'Learning Resource' },
    ]);
  });
});

describe('row 5 — OM URL page template full name', () => {
  it('renders the full configuration name, never the short card title', () => {
    expect(
      omUrlConfigurationBreadcrumbs(catalog, locate, formatEntityConfiguration, 'iSmart URL'),
    ).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Preferences', to: '/settings/preferences' },
      { label: 'iSmart URL Configuration' },
    ]);
  });
});

describe('row 6 — Lineage page breadcrumb plus plain h5', () => {
  it('carries the breadcrumb and the h5 heading contract, no PageHeader', () => {
    expect(lineageConfigurationChrome(catalog, locate, 'Lineage')).toEqual({
      breadcrumbs: [
        { label: 'Settings', to: '/settings' },
        { label: 'Preferences', to: '/settings/preferences' },
        { label: 'Lineage' },
      ],
      heading: { label: 'Lineage', level: 'h5' },
    });
  });
});

describe('row 7 / §9.4 — Data Asset Rules self-built array, last item linked', () => {
  it('reproduces the pin array: three items, last item keeps its URL', () => {
    expect(
      dataAssetRulesBreadcrumbs(catalog, locate, formatEntityConfiguration, 'Data Asset Rules'),
    ).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Preferences', to: '/settings/preferences' },
      {
        label: 'Data Asset Rules Configuration',
        to: '/settings/preferences/dataAssetRules',
      },
    ]);
  });
});

describe('row 8 — Bot detail page-owned breadcrumb', () => {
  it('renders Bots plus the raw bot name, with no Settings root', () => {
    expect(
      botDetailBreadcrumbs({
        botsLabel: 'Bots',
        botName: 'ingestion-bot',
        botsListLocation: { name: 'admin-bots' },
      }),
    ).toEqual([{ label: 'Bots', to: { name: 'admin-bots' } }, { label: 'ingestion-bot' }]);
  });
});

describe('row 9 — user detail and team parent chain', () => {
  it('renders no breadcrumb for a user detail', () => {
    expect(userDetailBreadcrumbs()).toEqual([]);
  });

  it('renders the Organization team as the three-level builder output, with no team name', () => {
    expect(
      teamDetailBreadcrumbs({
        isOrganization: true,
        catalog,
        locate,
        teamsLabel: 'Teams',
        parents: [{ displayName: 'Should Not Appear', location: { name: 'never' } }],
        currentTeamName: 'Organization',
      }),
    ).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Members', to: '/settings/members' },
      { label: 'Teams' },
    ]);
  });

  it('renders a non-Organization team as its parent chain ending in the unlinked team name', () => {
    expect(
      teamDetailBreadcrumbs({
        isOrganization: false,
        catalog,
        locate,
        teamsLabel: 'Teams',
        parents: [
          { displayName: 'Organization', location: { name: 'team-detail', params: { fqn: 'Organization' } } },
          { displayName: 'Engineering', location: { name: 'team-detail', params: { fqn: 'Organization.Engineering' } } },
        ],
        currentTeamName: 'Data Platform',
      }),
    ).toEqual([
      { label: 'Organization', to: { name: 'team-detail', params: { fqn: 'Organization' } } },
      { label: 'Engineering', to: { name: 'team-detail', params: { fqn: 'Organization.Engineering' } } },
      { label: 'Data Platform' },
    ]);
  });

  it('renders a parentless non-Organization team as the single current name', () => {
    expect(
      teamDetailBreadcrumbs({
        isOrganization: false,
        catalog,
        locate,
        teamsLabel: 'Teams',
        parents: [],
        currentTeamName: 'Lone Team',
      }),
    ).toEqual([{ label: 'Lone Team' }]);
  });
});

describe('R-WIRE-7 — Alert detail four-item array (pin notification branch)', () => {
  it('composes Settings, Notifications, Alerts and the entity, first three linked', () => {
    const crumbs = alertDetailBreadcrumbs(catalog, locate, 'Alerts', 'slack-hook');
    expect(crumbs).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Notifications', to: '/settings/notifications' },
      { label: 'Alerts', to: '/settings/notifications/alerts' },
      { label: 'slack-hook' },
    ]);
  });

  it('renders the resolved entity name verbatim, including the fallback', () => {
    const crumbs = alertDetailBreadcrumbs(catalog, locate, 'Alerts', 'Alerts');
    expect(crumbs[3]).toEqual({ label: 'Alerts' });
  });
});
