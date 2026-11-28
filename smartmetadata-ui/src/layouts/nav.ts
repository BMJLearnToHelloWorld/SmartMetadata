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
      { key: 'sparql-playground', titleKey: 'nav.sparqlPlayground' },
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

/**
 * Fix6: a section title click navigates to the section's first WORKING page,
 * not its first child — the marketplace section's first child (overview) is
 * itself a residual shell, so landing there would leave the click feeling dead.
 * Context Center has no working child, so its landing is its own overview
 * shell, which (also Fix6) carries onward links instead of a dead end.
 */
export const SECTION_LANDING: Record<string, string> = {
  observability: 'quality-test-cases',
  marketplace: 'marketplace-overview',
  governance: 'governance-glossaries',
  'context-center': 'context-center-overview',
};

export function sectionLanding(key: string): string | null {
  return SECTION_LANDING[key] ?? null;
}

const SECTION_KEYS = new Set(
  [...NAV_ENTRIES, ...NAV_FOOTER_ENTRIES].flatMap((entry) => (entry.kind === 'section' ? [entry.key] : [])),
);

const ACTION_KEYS = new Set(
  [...NAV_ENTRIES, ...NAV_FOOTER_ENTRIES].flatMap((entry) => (entry.kind === 'action' ? [entry.key] : [])),
);

const DETAIL_TO_LIST: Record<string, string> = {
  asset: 'search',
  lineage: 'lineage-home',
  // M1b/D-8 staged: the old user/Bot details keep their
  // original URLs, so their Hub mappings stay until the partition
  // batch atomically migrates them (DESIGN §6.6).
  'admin-user': 'admin-settings',
  'admin-users': 'admin-settings',
  'admin-team': 'admin-settings',
  'admin-role': 'admin-settings',
  'admin-roles': 'admin-settings',
  'admin-bot': 'admin-settings',
  'admin-policies': 'admin-settings',
  'admin-policy': 'admin-settings',
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
  'quality-data-quality-tab': 'quality-test-cases',
  // The incident record route redirects to the test-case detail page
  // (F-D-2), so its breadcrumb parent follows the landing page.
  'observability-incident': 'quality-test-cases',
  // Retained detail chains resolve straight to the Hub, never via a
  // deleted parent name (DESIGN §6.7 rows 1-2).
  'service-detail': 'admin-settings',
  'ingestion-service': 'admin-settings',
  'ingestion-service-connection': 'admin-settings',
  'ingestion-service-add-ingestion': 'admin-settings',
  'ingestion-service-edit-ingestion': 'admin-settings',
  'ingestion-service-version': 'admin-settings',
  'ingestion-pipeline': 'admin-settings',
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
  // Q5: no marketplace-app-catalog / marketplace-app-install entries —
  // those pages must not highlight the data-marketplace group, and the
  // app detail stays unmapped for the same reason.
  'admin-settings-governance-intake-forms': 'admin-settings',
  'admin-settings-governance-task-forms': 'admin-settings',
  'admin-settings-governance-glossary-term-relations': 'admin-settings',
  'announcement-duplicate': 'admin-settings',
  // Sections batch settings faces: hub attribution, like the other
  // settings routes above (reached from the hub, no top-level group).
  'settings-members': 'admin-settings',
  'settings-members-team': 'admin-settings',
  'settings-members-team-import': 'admin-settings',
  'settings-members-online-users': 'admin-settings',
  'settings-bots': 'admin-settings',
  'settings-notification-alert-add': 'admin-settings',
  'settings-notification-alert-edit': 'admin-settings',
  'settings-notification-announcement-add': 'admin-settings',
  'settings-notification-announcement-edit': 'admin-settings',
  'observability-alert-add': 'observability-alerts',
  'observability-alert-edit': 'observability-alerts',
  'observability-alert': 'observability-alerts',
  // Insights is a top-level-only leaf (same as search / lineage-home).
  // /insights redirects to /insights/data-assets; child routes must keep
  // highlighting `insights`, not a missing menu key.
  'insights-data-assets': 'insights',
  'insights-app-analytics': 'insights',
  'insights-kpis': 'insights',
  'insights-kpis-add': 'insights',
  'insights-kpi-detail': 'insights',
  'insights-kpis-edit': 'insights',
  task: 'tasks',
};

/**
 * Settings-space route names that keep a legacy name (DESIGN §6.6):
 * their pages moved under `/settings/` without a rename, so the
 * `admin-`/`settings-` prefix rule below does not catch them. Every
 * entry here is verified against the route table: notification alerts
 * and announcements under `settings/notifications/`, workflows under
 * `settings/governance/`, online users under `settings/members/`.
 * Observability alerts (`/observability/alerts`) are not settings-space.
 */
const SETTINGS_SPACE_NAMES = new Set([
  'settings-notification-alerts',
  'settings-notification-alert',
  'announcements',
  'announcement-duplicate',
  'workflows',
  'workflow-detail',
  'insights-online-users',
]);

/**
 * Whether a route name renders inside Settings (DESIGN §6.6). The
 * space is carried by the name: the `admin-`/`settings-` prefixes
 * (including the three staged `/admin/` chains, M1b/D-8) plus the
 * retained legacy names above. Everything else — including the
 * customize-page editor and the service wizard, which are not
 * settings-space pages — is unattributed by this rule.
 */
export function isSettingsRouteName(routeName: string | symbol | undefined | null): boolean {
  if (routeName === undefined || routeName === null) {
    return false;
  }
  const name = String(routeName);
  return (
    name.startsWith('admin-') || name.startsWith('settings-') || SETTINGS_SPACE_NAMES.has(name)
  );
}

/**
 * Hub attribution, stated once so it is not misread: settings-space
 * routes have no top-level nav group by design — they are reached
 * from the Settings hub — so they highlight `admin-settings` as the
 * hub entry, not as a claim that they live on the Settings page
 * itself. This rule subsumes the `admin-*` chains in DETAIL_TO_LIST
 * above, which are retained as the M1b/D-8 staging record. Detail
 * routes outside Settings resolve through DETAIL_TO_LIST; routes
 * with no group and no hub entry (tasks, activity, the customize
 * editor, the service wizard) keep no highlight — that is the honest
 * state, not a silent omission.
 */
export function selectedNavKey(routeName: string | symbol | undefined | null): string {
  if (isSettingsRouteName(routeName)) {
    return 'admin-settings';
  }
  const visited = new Set<string>();
  let current = String(routeName ?? 'home');
  while (DETAIL_TO_LIST[current] && !visited.has(current)) {
    visited.add(current);
    current = DETAIL_TO_LIST[current];
  }
  return current;
}

/**
 * Origin URL carried in router state by a navigation: the first link of
 * `breadcrumbData` (official `getSidebarPathname`,
 * `utils/LeftSidebarUtils.ts:30-75`, reads
 * `locationState?.breadcrumbData?.[0]?.url`). Returns null when the
 * state carries no breadcrumb link with a URL.
 */
export function breadcrumbOriginUrl(state: unknown): string | null {
  const links = (state as { breadcrumbData?: unknown } | null)?.breadcrumbData;
  if (!Array.isArray(links) || links.length === 0) {
    return null;
  }
  const url = (links[0] as { url?: unknown } | null)?.url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

/**
 * Sidebar key for a create-user visit, evaluated by its navigation
 * origin (DESIGN §6.6 / §10.6(4), official `getSidebarPathname` +
 * `getSidebarActiveKeys`). No origin → 'create-user' (never the Hub);
 * an origin that resolves to a route name is evaluated through the
 * same `selectedNavKey` rules as a direct visit; an unresolvable
 * origin also falls back to 'create-user'.
 *
 * Equivalence boundary (MI-3): the product evaluates by route name
 * (`router.resolve(origin)` → route name → `selectedNavKey`), while
 * official evaluates by path alias (`getSidebarPathname` returns the
 * raw origin path, then the nested/alias tables land on a shallow
 * path). So an origin that resolves to a route whose name is neither
 * a nav key nor in `DETAIL_TO_LIST` yields no highlight here, where
 * official would land on the shallow path.
 */
export function navKeyForOrigin(
  originUrl: string | null | undefined,
  resolveRouteName: (path: string) => string | null,
): string {
  if (!originUrl) {
    return 'create-user';
  }
  const name = resolveRouteName(originUrl);
  if (!name) {
    return 'create-user';
  }
  return selectedNavKey(name);
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
  return sectionKeyForNavKey(selectedNavKey(routeName));
}

/** Section owning a resolved nav key (the origin-aware counterpart of sectionKeyForRoute). */
export function sectionKeyForNavKey(selected: string): string | null {
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
  return [];
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
