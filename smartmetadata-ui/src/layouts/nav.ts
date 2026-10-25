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

export type NavEntry = NavLeaf | NavSection;

/**
 * Product information architecture aligned with official left-nav grouping
 * (Explore and Lineage as siblings; quality under Observability) using only
 * routes already in `router/index.ts`. Collate-only surfaces stay off this
 * list: Home/My Data, Insights, Marketplace landing, Ontology Studio,
 * Knowledge/Context Center, persona AI.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { kind: 'item', key: 'search', titleKey: 'nav.explore' },
  { kind: 'item', key: 'lineage-home', titleKey: 'nav.lineage' },
  {
    kind: 'section',
    key: 'observability',
    titleKey: 'nav.observability',
    testId: 'observability-nav',
    items: [
      { key: 'quality-test-definitions', titleKey: 'nav.testDefinitions', testId: 'quality-nav' },
      { key: 'quality-test-cases', titleKey: 'nav.testCases' },
      { key: 'quality-test-suites', titleKey: 'nav.testSuites' },
      { key: 'observability-incidents', titleKey: 'nav.incidents' },
      { key: 'observability-alerts', titleKey: 'nav.alerts' },
    ],
  },
  {
    kind: 'section',
    key: 'governance',
    titleKey: 'nav.governance',
    testId: 'governance-nav',
    items: [
      { key: 'governance-glossaries', titleKey: 'nav.glossaries' },
      { key: 'governance-classifications', titleKey: 'nav.classifications' },
      { key: 'governance-domains', titleKey: 'nav.domains' },
      { key: 'governance-data-products', titleKey: 'nav.dataProducts' },
    ],
  },
  {
    kind: 'section',
    key: 'ingestion',
    titleKey: 'nav.ingestion',
    testId: 'ingestion-nav',
    items: [
      { key: 'ingestion-services', titleKey: 'nav.services' },
      { key: 'ingestion-pipelines', titleKey: 'nav.pipelines' },
    ],
  },
  {
    kind: 'section',
    key: 'collaboration',
    titleKey: 'nav.collaboration',
    testId: 'collaboration-nav',
    items: [
      { key: 'activity', titleKey: 'nav.activity' },
      { key: 'tasks', titleKey: 'nav.tasks' },
      { key: 'announcements', titleKey: 'nav.announcements' },
    ],
  },
  {
    kind: 'section',
    key: 'admin',
    titleKey: 'nav.admin',
    testId: 'admin-nav',
    items: [
      { key: 'admin-users', titleKey: 'nav.users' },
      { key: 'admin-teams', titleKey: 'nav.teams' },
      { key: 'admin-roles', titleKey: 'nav.roles' },
      { key: 'admin-bots', titleKey: 'nav.bots' },
      { key: 'admin-settings', titleKey: 'nav.settings' },
    ],
  },
];

const SECTION_KEYS = new Set(
  NAV_ENTRIES.flatMap((entry) => (entry.kind === 'section' ? [entry.key] : [])),
);

const DETAIL_TO_LIST: Record<string, string> = {
  asset: 'search',
  lineage: 'lineage-home',
  'admin-user': 'admin-users',
  'admin-team': 'admin-teams',
  'admin-role': 'admin-roles',
  'admin-bot': 'admin-bots',
  'admin-settings-system': 'admin-settings',
  'governance-glossary': 'governance-glossaries',
  'governance-term': 'governance-glossaries',
  'governance-classification': 'governance-classifications',
  'governance-tag': 'governance-classifications',
  'governance-domain': 'governance-domains',
  'governance-data-product': 'governance-data-products',
  'quality-test-definition': 'quality-test-definitions',
  'quality-test-case': 'quality-test-cases',
  'quality-test-suite': 'quality-test-suites',
  'observability-incident': 'observability-incidents',
  'observability-alert': 'observability-alerts',
  'ingestion-service': 'ingestion-services',
  'ingestion-pipeline': 'ingestion-pipelines',
  task: 'tasks',
};

export function selectedNavKey(routeName: string | symbol | undefined | null): string {
  const name = String(routeName ?? 'search');
  return DETAIL_TO_LIST[name] ?? name;
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
