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
  defaultOpenNavKeys,
  isNavActionKey,
  isNavSectionKey,
  isSettingsRouteName,
  navRouteKeys,
  sectionKeyForRoute,
  sectionLanding,
  selectedNavKey,
} from './nav';

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
      'admin-teams',
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
    // §6.7 row 7, no-origin half: the reserved /create-user routes
    // are unregistered this batch (§10.6), and the name must never
    // default to Hub highlight. With-origin evaluation awaits the
    // breadcrumbData mechanism at registration time.
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
    expect(selectedNavKey('ingestion-services')).toBe('admin-settings');
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
