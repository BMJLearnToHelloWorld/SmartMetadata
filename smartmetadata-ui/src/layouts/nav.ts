/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export interface NavItem {
  key: string;
  titleKey: string;
  testId?: string;
}

export interface NavSection {
  kind: 'section';
  key: string;
  titleKey: string;
  testId?: string;
  items: NavItem[];
}

export interface NavLeaf {
  kind: 'item';
  key: string;
  titleKey: string;
  testId?: string;
}

export interface NavAction {
  kind: 'action';
  key: string;
  titleKey: string;
  testId?: string;
  action: 'logout';
}

export type NavEntry = NavLeaf | NavSection | NavAction;

/**
 * Left-nav information architecture aligned with the IQVIA/OM reference
 * sidebar: Home, Explore, Lineage, Observability, Insights, Data Marketplace,
 * Govern, Context Center, then Settings/Logout in the footer. Extra catalog
 * pages (ingestion, collaboration, members) stay reachable from Settings.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { kind: 'item', key: 'home', titleKey: 'nav.home' },
  { kind: 'item', key: 'search', titleKey: 'nav.explore' },
  { kind: 'item', key: 'lineage-home', titleKey: 'nav.lineage' },
  {
    kind: 'section',
    key: 'observability',
    titleKey: 'nav.observability',
    testId: 'observability-nav',
    items: [
      { key: 'quality-test-cases', titleKey: 'nav.dataQuality', testId: 'quality-nav' },
      { key: 'observability-incidents', titleKey: 'nav.incidentManager' },
      { key: 'observability-alerts', titleKey: 'nav.alerts' },
      { key: 'quality-test-definitions', titleKey: 'nav.testLibrary' },
    ],
  },
  { kind: 'item', key: 'insights', titleKey: 'nav.insights' },
  {
    kind: 'section',
    key: 'marketplace',
    titleKey: 'nav.marketplace',
    testId: 'marketplace-nav',
    items: [
      { key: 'marketplace-overview', titleKey: 'nav.overview' },
      { key: 'governance-domains', titleKey: 'nav.domains' },
      { key: 'governance-data-products', titleKey: 'nav.dataProducts' },
    ],
  },
  {
    kind: 'section',
    key: 'governance',
    titleKey: 'nav.govern',
    testId: 'governance-nav',
    items: [
      { key: 'governance-glossaries', titleKey: 'nav.glossary' },
      { key: 'ontology-explorer', titleKey: 'nav.ontologyExplorer' },
      { key: 'governance-classifications', titleKey: 'nav.classification' },
      { key: 'governance-metrics', titleKey: 'nav.metrics' },
      { key: 'column-bulk-ops', titleKey: 'nav.columnBulkOps' },
      { key: 'workflows', titleKey: 'nav.workflows' },
    ],
  },
  {
    kind: 'section',
    key: 'context-center',
    titleKey: 'nav.contextCenter',
    testId: 'context-center-nav',
    items: [
      { key: 'context-center-overview', titleKey: 'nav.overview' },
      { key: 'context-center-articles', titleKey: 'nav.articles' },
      { key: 'context-center-documents', titleKey: 'nav.documents' },
      { key: 'context-center-memories', titleKey: 'nav.memories' },
      { key: 'context-center-archive', titleKey: 'nav.archive' },
    ],
  },
];

export const NAV_FOOTER_ENTRIES: NavEntry[] = [
  { kind: 'item', key: 'admin-settings', titleKey: 'nav.settings', testId: 'nav-settings' },
  { kind: 'action', key: 'logout', titleKey: 'nav.logout', testId: 'nav-logout', action: 'logout' },
];

const SECTION_KEYS = new Set(
  [...NAV_ENTRIES, ...NAV_FOOTER_ENTRIES].flatMap((entry) => (entry.kind === 'section' ? [entry.key] : [])),
);

const ACTION_KEYS = new Set(
  [...NAV_ENTRIES, ...NAV_FOOTER_ENTRIES].flatMap((entry) => (entry.kind === 'action' ? [entry.key] : [])),
);

const DETAIL_TO_LIST: Record<string, string> = {
  asset: 'search',
  lineage: 'lineage-home',
  'admin-user': 'admin-settings',
  'admin-users': 'admin-settings',
  'admin-team': 'admin-settings',
  'admin-teams': 'admin-settings',
  'admin-role': 'admin-settings',
  'admin-roles': 'admin-settings',
  'admin-bot': 'admin-settings',
  'admin-bots': 'admin-settings',
  'admin-settings-system': 'admin-settings',
  'admin-policies': 'admin-settings',
  'admin-policy': 'admin-settings',
  'admin-settings-custom-properties': 'admin-settings',
  'admin-settings-custom-property-type': 'admin-settings',
  'governance-glossary': 'governance-glossaries',
  'governance-term': 'governance-glossaries',
  'governance-classification': 'governance-classifications',
  'governance-tag': 'governance-classifications',
  'governance-domain': 'governance-domains',
  'governance-data-product': 'governance-data-products',
  'quality-test-definition': 'quality-test-definitions',
  'quality-test-case': 'quality-test-cases',
  'quality-test-suite': 'quality-test-cases',
  'observability-incident': 'observability-incidents',
  'observability-alert': 'observability-alerts',
  'ingestion-service': 'ingestion-services',
  'ingestion-pipeline': 'ingestion-pipelines',
  'ingestion-services': 'admin-settings',
  'ingestion-pipelines': 'admin-settings',
  'announcements': 'admin-settings',
  'settings-preferences-appearance': 'admin-settings',
  'settings-preferences-email': 'admin-settings',
  'settings-preferences-login': 'admin-settings',
  'settings-preferences-health': 'admin-settings',
  'settings-preferences-profiler': 'admin-settings',
  'settings-preferences-dq-dimensions': 'admin-settings',
  'settings-preferences-search': 'admin-settings',
  'settings-preferences-search-entity': 'admin-settings',
  'settings-preferences-lineage': 'admin-settings',
  'settings-preferences-om-url': 'admin-settings',
  'settings-preferences-entity-rules': 'admin-settings',
  'settings-preferences-learning': 'admin-settings',
  'settings-preferences-app-mode': 'admin-settings',
  'settings-preferences-glossary': 'admin-settings',
  'settings-preferences-time-format': 'admin-settings',
  'admin-apps': 'admin-settings',
  task: 'tasks',
};

/**
 * Hub attribution, stated once so it is not misread: admin-*, ingestion-*
 * and announcements routes have no top-level nav group by design —
 * they are reached from the Settings hub — so they highlight
 * `admin-settings` as the hub entry, not as a claim that they live on
 * the Settings page itself. Tasks and activity keep no highlight (no
 * nav group, no hub entry); that is the honest state and a Stage 8
 * collaboration-navigation decision, not a silent omission.
 */
export function selectedNavKey(routeName: string | symbol | undefined | null): string {
  const visited = new Set<string>();
  let current = String(routeName ?? 'home');
  while (DETAIL_TO_LIST[current] && !visited.has(current)) {
    visited.add(current);
    current = DETAIL_TO_LIST[current];
  }
  return current;
}

/**
 * Permission-based nav filtering placeholder. The official shell
 * greys or hides entries by role, but no product role/permission
 * endpoint is wired to the shell, so no restriction is faked here:
 * the full entry list is returned unchanged, and Stage 8 plugs a real
 * permission source into this exact function.
 */
export function filterNavByPermission<T>(entries: readonly T[]): readonly T[] {
  return entries;
}

export function sectionKeyForRoute(routeName: string | symbol | undefined | null): string | null {
  const selected = selectedNavKey(routeName);
  for (const entry of NAV_ENTRIES) {
    if (entry.kind === 'section' && entry.items.some((item) => item.key === selected)) {
      return entry.key;
    }
  }
  return null;
}

export function isNavSectionKey(key: string): boolean {
  return SECTION_KEYS.has(key);
}

export function isNavActionKey(key: string): boolean {
  return ACTION_KEYS.has(key);
}

export function defaultOpenNavKeys(): string[] {
  return NAV_ENTRIES.flatMap((entry) => (entry.kind === 'section' ? [entry.key] : []));
}

export function navRouteKeys(): string[] {
  return [...NAV_ENTRIES, ...NAV_FOOTER_ENTRIES].flatMap((entry) => {
    if (entry.kind === 'item') {
      return [entry.key];
    }
    if (entry.kind === 'section') {
      return [entry.key, ...entry.items.map((item) => item.key)];
    }
    return [];
  });
}
