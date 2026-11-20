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
  NAV_ENTRIES,
  NAV_FOOTER_ENTRIES,
  breadcrumbOriginUrl,
  defaultOpenNavKeys,
  isNavActionKey,
  isNavSectionKey,
  isSettingsRouteName,
  navKeyForOrigin,
  navRouteKeys,
  sectionKeyForRoute,
  sectionLanding,
  selectedNavKey,
} from './nav';
import { navIcon } from './navIcons';

function sectionItems(key: string): string[] {
  const section = NAV_ENTRIES.find((entry) => entry.kind === 'section' && entry.key === key);
  return section?.kind === 'section' ? section.items.map((item) => item.key) : [];
}

describe('settings-space highlight rule (DESIGN §6.6)', () => {
  it('attributes every admin-*/settings-* route name to the Hub', () => {
    const names = [
      'admin-settings',
      'admin-apps',
      'admin-app',
      'admin-bots',
      'admin-users',
      'admin-admins',
      // 'admin-teams' is deleted (sections batch): the teams list is
      // reached via the settings-members-teams redirect, so the name
      // is intentionally absent from this list.
      'admin-team',
      'admin-roles',
      'admin-role',
      'admin-policies',
      'admin-policy',
      'admin-policy-rule-add',
      'admin-policy-rule-edit',
      'admin-settings-audit-logs',
      'admin-settings-permission-debugger',
      'admin-settings-sso',
      'admin-settings-persona',
      'admin-settings-persona-detail',
      'admin-settings-custom-property-type',
      'admin-settings-governance-intake-forms',
      'admin-settings-governance-task-forms',
      'admin-settings-governance-glossary-term-relations',
      'settings-category',
      'settings-services',
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
    ];
    for (const name of names) {
      expect(isSettingsRouteName(name)).toBe(true);
      expect(selectedNavKey(name)).toBe('admin-settings');
      expect(sectionKeyForRoute(name)).toBeNull();
    }
  });

  it('attributes the staged /admin/ chains to the Hub (M1b/D-8)', () => {
    for (const name of ['admin-user', 'admin-bot', 'admin-settings-system']) {
      expect(isSettingsRouteName(name)).toBe(true);
      expect(selectedNavKey(name)).toBe('admin-settings');
      expect(sectionKeyForRoute(name)).toBeNull();
    }
  });

  it('attributes the retained legacy names whose pages moved under /settings/', () => {
    const names = [
      'observability-alerts',
      'observability-alert',
      'announcements',
      'announcement-duplicate',
      'workflows',
      'workflow-detail',
      'insights-online-users',
    ];
    for (const name of names) {
      expect(isSettingsRouteName(name)).toBe(true);
      expect(selectedNavKey(name)).toBe('admin-settings');
      expect(sectionKeyForRoute(name)).toBeNull();
    }
  });

  it('does not overreach into non-settings routes', () => {
    // The customize editor and the service wizard are not settings-space.
    expect(isSettingsRouteName('customize-page')).toBe(false);
    expect(selectedNavKey('customize-page')).toBe('customize-page');
    expect(isSettingsRouteName('ingestion-service-add')).toBe(false);
    expect(selectedNavKey('ingestion-service-add')).toBe('ingestion-service-add');
    // Incidents live under /observability/, not /settings/: the alerts
    // rule must not swallow the incident names.
    expect(isSettingsRouteName('observability-incidents')).toBe(false);
    expect(selectedNavKey('observability-incidents')).toBe('observability-incidents');
    expect(sectionKeyForRoute('observability-incidents')).toBe('observability');
    expect(isSettingsRouteName('observability-incident')).toBe(false);
    expect(selectedNavKey('observability-incident')).toBe('quality-test-cases');
    // Retained detail chains still resolve through the table.
    expect(isSettingsRouteName('ingestion-service')).toBe(false);
    expect(selectedNavKey('ingestion-service')).toBe('admin-settings');
    expect(isSettingsRouteName('task')).toBe(false);
    expect(selectedNavKey('task')).toBe('tasks');
    // §6.7 row 7, no-origin half: the /create-user routes are
    // registered (router/index.ts), and the name must never default
    // to Hub highlight. With-origin evaluation lives in
    // navKeyForOrigin (below) and AppShell.
    expect(isSettingsRouteName('create-user')).toBe(false);
    expect(selectedNavKey('create-user')).toBe('create-user');
    // Empty and missing names are unattributed, never settings.
    expect(isSettingsRouteName(undefined)).toBe(false);
    expect(isSettingsRouteName(null)).toBe(false);
    expect(isSettingsRouteName(Symbol('settings'))).toBe(false);
    expect(selectedNavKey(undefined)).toBe('home');
    expect(selectedNavKey(null)).toBe('home');
  });
});

describe('nav IA', () => {
  it('follows the reference left-nav group order', () => {
    expect(NAV_ENTRIES.map((entry) => entry.key)).toEqual([
      'home',
      'search',
      // B-7(c): Connections sits after Explore, before Lineage (pin navOrder 20).
      'connections',
      'lineage-home',
      'observability',
      'insights',
      'marketplace',
      'governance',
      'context-center',
    ]);
    expect(NAV_FOOTER_ENTRIES.map((entry) => entry.key)).toEqual(['admin-settings', 'logout']);
    expect(NAV_FOOTER_ENTRIES[1]).toMatchObject({ kind: 'action', action: 'logout' });
  });

  it('resolves an icon for every top-level nav leaf', () => {
    // B-7(c) review Minor 1: a top-level leaf without an icon renders bare.
    // Section children are out of this guard: at least one predates it
    // without an icon (sparql-playground), which is not this lane's scope.
    for (const entry of NAV_ENTRIES) {
      if (entry.kind === 'item') {
        expect(navIcon(entry.key), entry.key).toBeTruthy();
      }
    }
  });

  it('nests Observability, Marketplace, Govern, and Context Center children', () => {
    expect(sectionItems('observability')).toEqual([
      'quality-test-cases',
      'observability-incidents',
      'observability-alerts',
      'quality-test-definitions',
    ]);
    expect(sectionItems('marketplace')).toEqual([
      'marketplace-overview',
      'governance-domains',
      'governance-data-products',
    ]);
    expect(sectionItems('governance')).toEqual([
      'governance-glossaries',
      'ontology-explorer',
      'governance-classifications',
      'governance-metrics',
      'column-bulk-ops',
      'workflows',
      'sparql-playground',
    ]);
    expect(sectionItems('context-center')).toEqual([
      'context-center-overview',
      'context-center-articles',
      'context-center-documents',
      'context-center-memories',
      'context-center-archive',
    ]);
  });

  it('drops extra top-level Ingestion, Collaboration, and Admin groups', () => {
    const keys = navRouteKeys();
    expect(keys).not.toContain('ingestion');
    expect(keys).not.toContain('ingestion-services');
    expect(keys).not.toContain('collaboration');
    expect(keys).not.toContain('activity');
    expect(keys).not.toContain('admin');
    expect(keys).not.toContain('admin-users');
    expect(keys).toContain('admin-settings');
    expect(keys).toContain('marketplace-overview');
    expect(keys).toContain('connections');
    expect(keys).toContain('ontology-explorer');
    expect(keys).not.toContain('logout');
  });

  it('maps detail routes onto their list item and settings leaf', () => {
    expect(selectedNavKey('asset')).toBe('search');
    expect(selectedNavKey('lineage')).toBe('lineage-home');
    expect(selectedNavKey('governance-term')).toBe('governance-glossaries');
    expect(selectedNavKey('quality-test-case')).toBe('quality-test-cases');
    expect(selectedNavKey('quality-test-suite')).toBe('quality-test-cases');
    expect(selectedNavKey('search')).toBe('search');
    expect(selectedNavKey('home')).toBe('home');
    expect(selectedNavKey('admin-settings-system')).toBe('admin-settings');
    expect(selectedNavKey('admin-policy')).toBe('admin-settings');
    expect(selectedNavKey('admin-user')).toBe('admin-settings');
    expect(selectedNavKey('admin-settings-custom-property-type')).toBe('admin-settings');
    expect(selectedNavKey('governance-domain')).toBe('governance-domains');
    expect(selectedNavKey('governance-data-product')).toBe('governance-data-products');
    expect(selectedNavKey('connections')).toBe('connections');
    expect(selectedNavKey('ingestion-service')).toBe('admin-settings');
    // Deleted route name (DESIGN §6.7 row 2): the aggregate pipelines
    // list has no route anymore, so the name is unattributed — no
    // highlight, rather than a false Hub claim.
    expect(selectedNavKey('ingestion-pipelines')).toBe('ingestion-pipelines');
    expect(selectedNavKey('ingestion-pipeline')).toBe('admin-settings');
    expect(selectedNavKey('announcements')).toBe('admin-settings');
    expect(selectedNavKey('activity')).toBe('activity');
    expect(selectedNavKey('tasks')).toBe('tasks');
    // Top-level-only Insights leaf: child tabs keep the same selected key
    // as Explore (search) and Lineage (lineage-home) do for their details.
    expect(selectedNavKey('insights')).toBe('insights');
    expect(selectedNavKey('insights-data-assets')).toBe('insights');
    expect(selectedNavKey('insights-app-analytics')).toBe('insights');
    expect(selectedNavKey('insights-kpis')).toBe('insights');
    expect(selectedNavKey('insights-kpi-detail')).toBe('insights');
    expect(selectedNavKey('insights-kpis-add')).toBe('insights');
    expect(selectedNavKey('insights-kpis-edit')).toBe('insights');
    // Online Users moved into Settings (settings/members/online-users),
    // so its highlight follows the Hub, not the Insights leaf (§6.6).
    expect(selectedNavKey('insights-online-users')).toBe('admin-settings');
    // Q5: catalog/install/detail never highlight the data-marketplace
    // group — the catalog and install entries are deleted and the
    // detail stays unmapped, so each resolves to itself.
    expect(selectedNavKey('marketplace-app-catalog')).toBe('marketplace-app-catalog');
    expect(selectedNavKey('marketplace-app-install')).toBe('marketplace-app-install');
    expect(selectedNavKey('marketplace-app-detail')).toBe('marketplace-app-detail');
    // Sections batch settings faces: hub attribution.
    expect(selectedNavKey('settings-members')).toBe('admin-settings');
    expect(selectedNavKey('settings-members-team')).toBe('admin-settings');
    expect(selectedNavKey('settings-members-team-import')).toBe('admin-settings');
    expect(selectedNavKey('settings-members-online-users')).toBe('admin-settings');
    expect(selectedNavKey('settings-bots')).toBe('admin-settings');
    expect(selectedNavKey('settings-notification-alerts')).toBe('admin-settings');
    expect(selectedNavKey('settings-notification-alert')).toBe('admin-settings');
    expect(selectedNavKey('settings-notification-announcements')).toBe('admin-settings');
    expect(selectedNavKey('observability-alert-add')).toBe('observability-alerts');
    expect(selectedNavKey('observability-alert-edit')).toBe('observability-alerts');
    // The top-level user/bot/create faces are not settings pages and
    // belong to no nav group: no highlight.
    expect(selectedNavKey('user-detail')).toBe('user-detail');
    expect(selectedNavKey('bot-detail')).toBe('bot-detail');
    expect(selectedNavKey('create-user')).toBe('create-user');
  });

  it('opens the section that owns the current route', () => {
    expect(sectionKeyForRoute('asset')).toBeNull();
    expect(sectionKeyForRoute('quality-test-case')).toBe('observability');
    expect(sectionKeyForRoute('quality-test-suite')).toBe('observability');
    expect(sectionKeyForRoute('governance-domain')).toBe('marketplace');
    expect(sectionKeyForRoute('governance-glossary')).toBe('governance');
    expect(sectionKeyForRoute('context-center-articles')).toBe('context-center');
    expect(sectionKeyForRoute('admin-user')).toBeNull();
    expect(sectionKeyForRoute('activity')).toBeNull();
    expect(isNavSectionKey('governance')).toBe(true);
    expect(isNavSectionKey('marketplace')).toBe(true);
    expect(isNavSectionKey('search')).toBe(false);
    expect(isNavActionKey('logout')).toBe(true);
    expect(isNavActionKey('admin-settings')).toBe(false);
    expect(defaultOpenNavKeys()).toEqual([]);
  });

  it('lands section title clicks on a working page, never on a section key (Fix6)', () => {
    // B3-5: the marketplace overview is a real page now, so the section
    // lands on it instead of the Fix6 workaround target (domains list).
    expect(sectionLanding('marketplace')).toBe('marketplace-overview');
    expect(sectionLanding('governance')).toBe('governance-glossaries');
    expect(sectionLanding('observability')).toBe('quality-test-cases');
    // Context Center has no working child: its landing is its own overview
    // shell, which carries onward links (Fix6 M2) instead of a dead end.
    expect(sectionLanding('context-center')).toBe('context-center-overview');
    expect(sectionLanding('home')).toBeNull();
    for (const section of ['marketplace', 'governance', 'observability']) {
      const landing = sectionLanding(section);
      expect(landing).not.toBeNull();
    }
  });

});

describe('create-user with-origin highlight (DESIGN §6.6 / §10.6(4))', () => {
  it('reads the origin URL from breadcrumbData[0].url only', () => {
    expect(breadcrumbOriginUrl(null)).toBeNull();
    expect(breadcrumbOriginUrl(undefined)).toBeNull();
    expect(breadcrumbOriginUrl({})).toBeNull();
    expect(breadcrumbOriginUrl({ breadcrumbData: [] })).toBeNull();
    expect(breadcrumbOriginUrl({ breadcrumbData: [{ url: '' }] })).toBeNull();
    expect(breadcrumbOriginUrl({ breadcrumbData: [{ url: 42 }] })).toBeNull();
    expect(
      breadcrumbOriginUrl({ breadcrumbData: [{ url: '/settings/members/users' }] }),
    ).toBe('/settings/members/users');
    // Only the first link is the origin; later links never are.
    expect(
      breadcrumbOriginUrl({
        breadcrumbData: [{ name: 'Users' }, { url: '/settings/members/users' }],
      }),
    ).toBeNull();
  });

  it('evaluates the highlight by the origin, never forcing the Hub', () => {
    const resolve = (path: string): string | null =>
      path === '/settings/members/users'
        ? 'settings-members-users'
        : path === '/users/alice'
          ? 'user-detail'
          : null;
    // No origin → the create-user key itself.
    expect(navKeyForOrigin(null, resolve)).toBe('create-user');
    expect(navKeyForOrigin(undefined, resolve)).toBe('create-user');
    expect(navKeyForOrigin('', resolve)).toBe('create-user');
    // A settings-space origin highlights the Hub.
    expect(navKeyForOrigin('/settings/members/users', resolve)).toBe('admin-settings');
    // A non-settings origin evaluates through the same rules as a
    // direct visit (user-detail follows DETAIL_TO_LIST).
    expect(navKeyForOrigin('/users/alice', resolve)).toBe(selectedNavKey('user-detail'));
    // An unresolvable origin falls back to the create-user key.
    expect(navKeyForOrigin('/nowhere/at-all', resolve)).toBe('create-user');
  });
});
